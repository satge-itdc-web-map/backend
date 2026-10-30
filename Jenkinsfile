pipeline {
    agent any

    options {
        // Évite deux déploiements simultanés (et donc deux imports de données en même temps)
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        // Vérifie les changements sur le dépôt Git toutes les 2 minutes et lance le build automatiquement
        pollSCM('H/2 * * * *')
    }

    environment {
        NETWORK_NAME            = 'app-network'

        POSTGRES_CONTAINER_NAME = 'nestjs_postgres'
        POSTGRES_IMAGE          = 'postgis/postgis:15-3.3-alpine'
        POSTGRES_PORT           = '5432'

        BACKEND_CONTAINER_NAME  = 'nestjs_backend'
        BACKEND_IMAGE           = 'backend-web-map-backend:latest'
        BACKEND_PORT            = '4000'

        DB_NAME                 = 'webmap_db'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Reseau et Volumes') {
            steps {
                sh '''
                    docker network inspect ${NETWORK_NAME} >/dev/null 2>&1 \
                        || docker network create ${NETWORK_NAME}
                '''
            }
        }

        // Seul le backend est arrêté : la base reste en marche (plus de coupure à chaque build)
        stage('Stop Old Backend') {
            steps {
                sh '''
                    if [ "$(docker ps -aq -f name=^/${BACKEND_CONTAINER_NAME}$)" ]; then
                        echo "Arrêt de l'ancien backend..."
                        docker stop ${BACKEND_CONTAINER_NAME} || true
                        docker rm ${BACKEND_CONTAINER_NAME} || true
                    fi
                '''
            }
        }

        stage('Deploy Database (PostGIS)') {
            steps {
                withCredentials([
                    string(credentialsId: 'WEB_MAP_POSTGRES_USER', variable: 'CRED_POSTGRES_USER'),
                    string(credentialsId: 'WEB_MAP_POSTGRES_PASSWORD', variable: 'CRED_POSTGRES_PASSWORD')
                ]) {
                    sh '''
                        set +x
                        [ -n "$CRED_POSTGRES_USER" ]     || { echo "Credential WEB_MAP_POSTGRES_USER vide"; exit 1; }
                        [ -n "$CRED_POSTGRES_PASSWORD" ] || { echo "Credential WEB_MAP_POSTGRES_PASSWORD vide"; exit 1; }

                        # La base est conservée si elle tourne déjà et n'expose aucun port sur l'hôte.
                        # Sinon (arrêtée, ou ancien conteneur avec -p 5433) elle est recréée :
                        # les données restent dans le volume postgres_data.
                        RUNNING="$(docker ps -q -f name=^/${POSTGRES_CONTAINER_NAME}$)"
                        PUBLISHED="$(docker port ${POSTGRES_CONTAINER_NAME} 2>/dev/null || true)"

                        if [ -n "$RUNNING" ] && [ -z "$PUBLISHED" ]; then
                            echo "Base de données déjà en marche : conservée."
                        else
                            docker rm -f ${POSTGRES_CONTAINER_NAME} >/dev/null 2>&1 || true
                            echo "Lancement de la base de données PostGIS..."
                            docker run -d \
                                --name ${POSTGRES_CONTAINER_NAME} \
                                --network ${NETWORK_NAME} \
                                --network-alias postgres_db \
                                --restart always \
                                -e POSTGRES_USER="${CRED_POSTGRES_USER}" \
                                -e POSTGRES_PASSWORD="${CRED_POSTGRES_PASSWORD}" \
                                -e POSTGRES_DB="${DB_NAME}" \
                                -v postgres_data:/var/lib/postgresql/data \
                                ${POSTGRES_IMAGE} >/dev/null
                            echo "Base de données démarrée."
                        fi
                    '''
                }
            }
        }

        stage('Build & Deploy Backend') {
            steps {
                withCredentials([
                    string(credentialsId: 'WEB_MAP_JWT_SECRET', variable: 'CRED_JWT_SECRET'),
                    string(credentialsId: 'WEB_MAP_POSTGRES_USER', variable: 'CRED_POSTGRES_USER'),
                    string(credentialsId: 'WEB_MAP_POSTGRES_PASSWORD', variable: 'CRED_POSTGRES_PASSWORD')
                ]) {
                    sh '''
                        set +x
                        [ -n "$CRED_JWT_SECRET" ]        || { echo "Credential WEB_MAP_JWT_SECRET vide"; exit 1; }
                        [ -n "$CRED_POSTGRES_USER" ]     || { echo "Credential WEB_MAP_POSTGRES_USER vide"; exit 1; }
                        [ -n "$CRED_POSTGRES_PASSWORD" ] || { echo "Credential WEB_MAP_POSTGRES_PASSWORD vide"; exit 1; }

                        echo "Construction de l'image Backend..."
                        docker build -t ${BACKEND_IMAGE} .

                        echo "Lancement du conteneur Backend..."
                        # Le frontend joint le backend par le réseau Docker (/api -> nestjs_backend).
                        # Ce port reste publié pour l'application mobile ; si elle n'appelle plus
                        # le backend en direct, remplacer par : -p 127.0.0.1:${BACKEND_PORT}:${BACKEND_PORT}
                        docker run -d \
                            --name ${BACKEND_CONTAINER_NAME} \
                            --network ${NETWORK_NAME} \
                            --restart always \
                            -p ${BACKEND_PORT}:${BACKEND_PORT} \
                            -e NODE_ENV=production \
                            -e PORT="${BACKEND_PORT}" \
                            -e JWT_SECRET="${CRED_JWT_SECRET}" \
                            -e DB_HOST="${POSTGRES_CONTAINER_NAME}" \
                            -e DB_PORT="${POSTGRES_PORT}" \
                            -e DB_USERNAME="${CRED_POSTGRES_USER}" \
                            -e DB_PASSWORD="${CRED_POSTGRES_PASSWORD}" \
                            -e DB_NAME="${DB_NAME}" \
                            ${BACKEND_IMAGE} >/dev/null
                        echo "Backend lancé."
                    '''
                }
            }
        }

        // L'import des données se fait avant le démarrage de l'API : on attend le message de démarrage
        stage('Health Check') {
            steps {
                sh '''
                    echo "--- Attente du démarrage du backend (import des données inclus) ---"
                    for i in $(seq 1 60); do
                        if docker logs ${BACKEND_CONTAINER_NAME} 2>&1 | grep -q "Démarrage réussi"; then
                            echo "Backend démarré."
                            break
                        fi
                        if [ -z "$(docker ps -q -f name=^/${BACKEND_CONTAINER_NAME}$)" ]; then
                            echo "Le conteneur backend s'est arrêté."
                            exit 1
                        fi
                        if [ "$i" = "60" ]; then
                            echo "Le backend ne démarre pas (délai dépassé)."
                            exit 1
                        fi
                        sleep 5
                    done

                    echo "--- Statut des conteneurs ---"
                    docker ps --filter "network=${NETWORK_NAME}"

                    echo "--- Logs du Backend ---"
                    docker logs --tail=30 ${BACKEND_CONTAINER_NAME}
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline exécuté avec succès !"
        }
        failure {
            sh '''
                for c in ${BACKEND_CONTAINER_NAME} ${POSTGRES_CONTAINER_NAME}; do
                    echo "--- Logs $c ---"
                    docker logs --tail=100 "$c" 2>&1 || echo "Conteneur $c introuvable"
                done
            '''
        }
        always {
            cleanWs()
        }
    }
}