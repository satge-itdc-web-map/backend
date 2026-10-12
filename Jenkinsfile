pipeline {
    agent any

    environment {
        NETWORK_NAME    = 'app-network'
        
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

        stage('Stop Old Containers') {
            steps {
                sh '''
                    for c in ${BACKEND_CONTAINER_NAME} ${POSTGRES_CONTAINER_NAME}; do
                        if [ "$(docker ps -aq -f name=^/${c}$)" ]; then
                            echo "Arrêt du conteneur $c..."
                            docker stop "$c" || true
                            docker rm "$c" || true
                        fi
                    done
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
                        echo "Lancement de la base de données PostGIS..."
                        docker run -d \
                            --name ${POSTGRES_CONTAINER_NAME} \
                            --network ${NETWORK_NAME} \
                            --network-alias postgres_db \
                            --restart always \
                            -e POSTGRES_USER="${CRED_POSTGRES_USER:-postgres}" \
                            -e POSTGRES_PASSWORD="${CRED_POSTGRES_PASSWORD:-postgres}" \
                            -e POSTGRES_DB="${DB_NAME}" \
                            -p 5433:5432 \
                            -v postgres_data:/var/lib/postgresql/data \
                            ${POSTGRES_IMAGE} >/dev/null
                        echo "Base de données démarrée."
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
                        echo "Construction de l'image Backend..."
                        docker build -t ${BACKEND_IMAGE} .

                        echo "Lancement du conteneur Backend..."
                        docker run -d \
                            --name ${BACKEND_CONTAINER_NAME} \
                            --network ${NETWORK_NAME} \
                            --restart always \
                            -p ${BACKEND_PORT}:${BACKEND_PORT} \
                            -e NODE_ENV=production \
                            -e PORT=${BACKEND_PORT} \
                            -e JWT_SECRET="${CRED_JWT_SECRET}" \
                            -e DB_HOST="${POSTGRES_CONTAINER_NAME}" \
                            -e DB_PORT="${POSTGRES_PORT}" \
                            -e DB_USERNAME="${CRED_POSTGRES_USER:-postgres}" \
                            -e DB_PASSWORD="${CRED_POSTGRES_PASSWORD:-postgres}" \
                            -e DB_NAME="${DB_NAME}" \
                            ${BACKEND_IMAGE} >/dev/null
                        echo "Backend déployé avec succès."
                    '''
                }
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 5
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