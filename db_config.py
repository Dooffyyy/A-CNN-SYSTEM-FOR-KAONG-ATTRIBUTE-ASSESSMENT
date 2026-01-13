import mysql.connector
from mysql.connector import Error


def get_db_connection(use_database=True):
    try:
        connection_params = {
            'host': 'localhost',
            'user': 'root',
            'password': '',
            'port': 3306
        }

        if use_database:
            connection_params['database'] = 'kaong_assessment'

        connection = mysql.connector.connect(**connection_params)
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None


def init_db():
    # First connect without database
    connection = get_db_connection(use_database=False)
    if connection:
        try:
            cursor = connection.cursor()

            # Create database if it doesn't exist
            cursor.execute("CREATE DATABASE IF NOT EXISTS kaong_assessment")
            cursor.execute("USE kaong_assessment")

            # Create assessments table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS assessments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    image_url VARCHAR(255) NOT NULL,
                    assessment VARCHAR(100) NOT NULL,
                    confidence DECIMAL(5,3) NOT NULL,
                    source VARCHAR(50) NOT NULL,
                    detection_data JSON,
                    ripe_image_url VARCHAR(255),
                    unripe_image_url VARCHAR(255),
                    rotten_image_url VARCHAR(255),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_source (source),
                    INDEX idx_assessment (assessment)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # Check if detection_data column exists, if not add it
            cursor.execute("SHOW COLUMNS FROM assessments LIKE 'detection_data'")
            if not cursor.fetchone():
                print("Adding detection_data column to existing table...")
                cursor.execute("ALTER TABLE assessments ADD COLUMN detection_data JSON")
                print("✅ detection_data column added!")
            
            # Update existing columns if needed
            cursor.execute("SHOW COLUMNS FROM assessments")
            columns = [col[0] for col in cursor.fetchall()]
            
            # Update assessment column size if needed
            if 'assessment' in columns:
                cursor.execute("ALTER TABLE assessments MODIFY COLUMN assessment VARCHAR(100)")
                print("✅ Updated assessment column size")
            
            # Update confidence column type if needed
            if 'confidence' in columns:
                cursor.execute("ALTER TABLE assessments MODIFY COLUMN confidence DECIMAL(5,3)")
                print("✅ Updated confidence column type")
            
            # Add category image URL columns if they don't exist
            for column_name in ['ripe_image_url', 'unripe_image_url', 'rotten_image_url']:
                cursor.execute(f"SHOW COLUMNS FROM assessments LIKE '{column_name}'")
                if not cursor.fetchone():
                    cursor.execute(f"ALTER TABLE assessments ADD COLUMN {column_name} VARCHAR(255)")
                    print(f"✅ Added {column_name} column")
            
            connection.commit()
            print("Database initialized successfully")
        except Error as e:
            print(f"Error initializing database: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()

init_db()