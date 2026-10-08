pipeline {
    agent any

    environment {
        APP_NAME = 'nestjs-backend'
        PORT = '4000'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Deploy via Docker') {
            steps {
                withCredentials([
                    string(credentialsId: 'JWT_SECRET_CREDENTIAL_ID', variable: 'JWT_SECRET'),
                    string(credentialsId: 'DATABASE_URL_CREDENTIAL_ID', variable: 'DATABASE_URL')
                ]) {
                    sh '''
                        echo "NODE_ENV=production" > .env
                        echo "PORT=${PORT}" >> .env
                        echo "JWT_SECRET=${JWT_SECRET}" >> .env
                        echo "DATABASE_URL=${DATABASE_URL}" >> .env
                        
                        # Variables séparées attendues par NestJS
                        echo "DB_HOST=postgres_db" >> .env
                        echo "DB_PORT=5432" >> .env
                        echo "DB_USERNAME=postgres" >> .env
                        echo "DB_PASSWORD=postgres" >> .env
                        echo "DB_NAME=webmap_db" >> .env
                        
                        docker compose down || true
                        docker compose up -d --build
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo "Déploiement du backend et de la base de données réussi !"
        }
        failure {
            echo "Échec du déploiement."
        }
    }
}