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

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${APP_NAME}:latest ."
            }
        }

        stage('Deploy Container') {
            steps {
                // Injection des credentials Jenkins dans le fichier .env avant le lancement
                withCredentials([
                    string(credentialsId: 'JWT_SECRET_CREDENTIAL_ID', variable: 'JWT_SECRET'),
                    string(credentialsId: 'DATABASE_URL_CREDENTIAL_ID', variable: 'DATABASE_URL')
                ]) {
                    sh '''
                        echo "NODE_ENV=production" > .env
                        echo "PORT=${PORT}" >> .env
                        echo "JWT_SECRET=${JWT_SECRET}" >> .env
                        echo "DATABASE_URL=${DATABASE_URL}" >> .env
                        
                        docker-compose down || true
                        docker-compose up -d --build
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
            echo "Déploiement de l'application sur le port ${PORT} réussi !"
        }
        failure {
            echo "Échec du déploiement."
        }
    }
}