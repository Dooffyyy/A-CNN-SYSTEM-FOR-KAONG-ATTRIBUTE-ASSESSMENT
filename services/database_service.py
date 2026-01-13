"""
Database service for handling all database operations.
Provides connection pooling, proper error handling, and data access methods.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import contextmanager
import mysql.connector
from mysql.connector import pooling, Error
from dataclasses import dataclass

from config import DB_CONFIG

logger = logging.getLogger(__name__)

@dataclass
class Assessment:
    """Data class representing an assessment record."""
    id: Optional[int] = None
    image_url: str = ""
    assessment: str = ""
    confidence: float = 0.0
    source: str = ""
    detection_data: Optional[Dict[str, Any]] = None
    ripe_image_url: Optional[str] = None
    unripe_image_url: Optional[str] = None
    rotten_image_url: Optional[str] = None
    timestamp: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert assessment to dictionary format."""
        return {
            'id': self.id,
            'image_url': self.image_url,
            'assessment': self.assessment,
            'confidence': self.confidence,
            'source': self.source,
            'detection_data': self.detection_data,
            'ripe_image_url': self.ripe_image_url,
            'unripe_image_url': self.unripe_image_url,
            'rotten_image_url': self.rotten_image_url,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

class DatabaseService:
    """Service class for handling all database operations."""
    
    def __init__(self):
        """Initialize the database service with connection pooling."""
        self._pool = None
        self._initialize_pool()
    
    def _initialize_pool(self) -> None:
        """Initialize the database connection pool."""
        try:
            pool_config = {
                'pool_name': 'kaong_detection_pool',
                'pool_size': DB_CONFIG['pool_size'],
                'pool_reset_session': DB_CONFIG['pool_reset_session'],
                'host': DB_CONFIG['host'],
                'user': DB_CONFIG['user'],
                'password': DB_CONFIG['password'],
                'database': DB_CONFIG['database'],
                'port': DB_CONFIG['port'],
                'charset': DB_CONFIG['charset'],
                'autocommit': DB_CONFIG['autocommit']
            }
            
            self._pool = mysql.connector.pooling.MySQLConnectionPool(**pool_config)
            logger.info("Database connection pool initialized successfully")
            
        except Error as e:
            logger.error(f"Failed to create database connection pool: {str(e)}")
            raise RuntimeError(f"Database pool initialization failed: {str(e)}")
    
    @contextmanager
    def get_connection(self):
        """
        Context manager for getting database connections from the pool.
        Ensures proper connection cleanup.
        """
        connection = None
        try:
            connection = self._pool.get_connection()
            yield connection
        except Error as e:
            logger.error(f"Database connection error: {str(e)}")
            if connection and connection.is_connected():
                connection.rollback()
            raise
        finally:
            if connection and connection.is_connected():
                connection.close()
    
    def test_connection(self) -> bool:
        """Test if the database connection is working."""
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                cursor.close()
                return result is not None
        except Exception as e:
            logger.error(f"Database connection test failed: {str(e)}")
            return False
    
    def create_tables(self) -> bool:
        """Create the assessments table if it doesn't exist."""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS assessments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            image_url VARCHAR(255) NOT NULL,
            assessment VARCHAR(100) NOT NULL,
            confidence DECIMAL(5,3) NOT NULL,
            source VARCHAR(50) NOT NULL,
            detection_data JSON,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_timestamp (timestamp),
            INDEX idx_source (source),
            INDEX idx_assessment (assessment)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor()
                cursor.execute(create_table_sql)
                connection.commit()
                cursor.close()
                logger.info("Assessments table created/verified successfully")
                return True
                
        except Error as e:
            logger.error(f"Failed to create assessments table: {str(e)}")
            return False
    
    def save_assessment(self, assessment: Assessment) -> Optional[int]:
        """
        Save an assessment to the database.
        
        Args:
            assessment: Assessment object to save
            
        Returns:
            The ID of the inserted record, or None if failed
        """
        insert_sql = """
        INSERT INTO assessments (image_url, assessment, confidence, source, detection_data, ripe_image_url, unripe_image_url, rotten_image_url, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor()
                
                # Use current timestamp if none provided
                timestamp = assessment.timestamp or datetime.now()
                
                # Convert detection_data to JSON string if present
                detection_json = None
                if assessment.detection_data:
                    import json
                    detection_json = json.dumps(assessment.detection_data)
                
                values = (
                    assessment.image_url,
                    assessment.assessment,
                    assessment.confidence,
                    assessment.source,
                    detection_json,
                    assessment.ripe_image_url,
                    assessment.unripe_image_url,
                    assessment.rotten_image_url,
                    timestamp
                )
                
                cursor.execute(insert_sql, values)
                connection.commit()
                
                # Get the inserted ID
                assessment_id = cursor.lastrowid
                cursor.close()
                
                logger.info(f"Assessment saved successfully with ID: {assessment_id}")
                return assessment_id
                
        except Error as e:
            logger.error(f"Failed to save assessment: {str(e)}")
            return None
    
    def get_all_assessments(self, limit: Optional[int] = None) -> List[Assessment]:
        """
        Retrieve all assessments from the database.
        
        Args:
            limit: Optional limit on number of records to retrieve
            
        Returns:
            List of Assessment objects
        """
        select_sql = """
        SELECT id, image_url, assessment, confidence, source, detection_data, 
               COALESCE(ripe_image_url, NULL) as ripe_image_url,
               COALESCE(unripe_image_url, NULL) as unripe_image_url, 
               COALESCE(rotten_image_url, NULL) as rotten_image_url,
               timestamp 
        FROM assessments 
        ORDER BY timestamp DESC
        """
        
        if limit:
            select_sql += f" LIMIT {int(limit)}"
        
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor(dictionary=True)
                cursor.execute(select_sql)
                rows = cursor.fetchall()
                cursor.close()
                
                assessments = []
                for row in rows:
                    # Parse detection_data from JSON if present
                    detection_data = None
                    if row['detection_data']:
                        import json
                        try:
                            detection_data = json.loads(row['detection_data'])
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse detection_data for assessment {row['id']}")
                    
                    assessment = Assessment(
                        id=row['id'],
                        image_url=row['image_url'],
                        assessment=row['assessment'],
                        confidence=float(row['confidence']),
                        source=row['source'],
                        detection_data=detection_data,
                        ripe_image_url=row.get('ripe_image_url') if 'ripe_image_url' in row else None,
                        unripe_image_url=row.get('unripe_image_url') if 'unripe_image_url' in row else None,
                        rotten_image_url=row.get('rotten_image_url') if 'rotten_image_url' in row else None,
                        timestamp=row['timestamp']
                    )
                    assessments.append(assessment)
                
                logger.debug(f"Retrieved {len(assessments)} assessments from database")
                return assessments
                
        except Error as e:
            logger.error(f"Failed to retrieve assessments: {str(e)}")
            return []
    
    def get_assessments_by_source(self, source: str, limit: Optional[int] = None) -> List[Assessment]:
        """
        Retrieve assessments filtered by source.
        
        Args:
            source: Source to filter by ('upload', 'camera_ws', etc.)
            limit: Optional limit on number of records
            
        Returns:
            List of Assessment objects
        """
        select_sql = """
        SELECT id, image_url, assessment, confidence, source, detection_data, 
               COALESCE(ripe_image_url, NULL) as ripe_image_url,
               COALESCE(unripe_image_url, NULL) as unripe_image_url, 
               COALESCE(rotten_image_url, NULL) as rotten_image_url,
               timestamp 
        FROM assessments 
        WHERE source = %s 
        ORDER BY timestamp DESC
        """
        
        if limit:
            select_sql += f" LIMIT {int(limit)}"
        
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor(dictionary=True)
                cursor.execute(select_sql, (source,))
                rows = cursor.fetchall()
                cursor.close()
                
                assessments = []
                for row in rows:
                    # Parse detection_data from JSON if present
                    detection_data = None
                    if row['detection_data']:
                        import json
                        try:
                            detection_data = json.loads(row['detection_data'])
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse detection_data for assessment {row['id']}")
                    
                    assessment = Assessment(
                        id=row['id'],
                        image_url=row['image_url'],
                        assessment=row['assessment'],
                        confidence=float(row['confidence']),
                        source=row['source'],
                        detection_data=detection_data,
                        ripe_image_url=row.get('ripe_image_url') if 'ripe_image_url' in row else None,
                        unripe_image_url=row.get('unripe_image_url') if 'unripe_image_url' in row else None,
                        rotten_image_url=row.get('rotten_image_url') if 'rotten_image_url' in row else None,
                        timestamp=row['timestamp']
                    )
                    assessments.append(assessment)
                
                logger.debug(f"Retrieved {len(assessments)} assessments for source '{source}'")
                return assessments
                
        except Error as e:
            logger.error(f"Failed to retrieve assessments by source: {str(e)}")
            return []
    
    def get_assessment_stats(self) -> Dict[str, Any]:
        """
        Get statistics about assessments in the database.
        
        Returns:
            Dictionary containing statistics
        """
        stats_sql = """
        SELECT 
            COUNT(*) as total_assessments,
            AVG(confidence) as avg_confidence,
            MAX(confidence) as max_confidence,
            MIN(confidence) as min_confidence,
            assessment,
            COUNT(*) as count
        FROM assessments 
        GROUP BY assessment
        """
        
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor(dictionary=True)
                cursor.execute(stats_sql)
                rows = cursor.fetchall()
                
                # Get total count
                cursor.execute("SELECT COUNT(*) as total FROM assessments")
                total_row = cursor.fetchone()
                cursor.close()
                
                stats = {
                    'total_assessments': total_row['total'] if total_row else 0,
                    'assessment_breakdown': rows
                }
                
                logger.debug(f"Retrieved assessment statistics: {stats}")
                return stats
                
        except Error as e:
            logger.error(f"Failed to retrieve assessment statistics: {str(e)}")
            return {'total_assessments': 0, 'assessment_breakdown': []}
    
    def get_assessment_by_id(self, assessment_id: int) -> Optional[Assessment]:
        """Get a specific assessment by ID."""
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor(dictionary=True)
                
                query = """
                    SELECT id, image_url, assessment, confidence, source, 
                           detection_data, ripe_image_url, unripe_image_url, 
                           rotten_image_url, timestamp
                    FROM assessments 
                    WHERE id = %s
                """
                
                cursor.execute(query, (assessment_id,))
                row = cursor.fetchone()
                
                if row:
                    assessment = Assessment(
                        id=row['id'],
                        image_url=row['image_url'],
                        assessment=row['assessment'],
                        confidence=row['confidence'],
                        source=row['source'],
                        detection_data=row['detection_data'],
                        ripe_image_url=row['ripe_image_url'],
                        unripe_image_url=row['unripe_image_url'],
                        rotten_image_url=row['rotten_image_url'],
                        timestamp=row['timestamp']
                    )
                    logger.debug(f"Retrieved assessment {assessment_id}")
                    return assessment
                else:
                    logger.warning(f"Assessment {assessment_id} not found")
                    return None
                    
        except Error as e:
            logger.error(f"Failed to retrieve assessment {assessment_id}: {str(e)}")
            return None
    
    def delete_assessment(self, assessment_id: int) -> bool:
        """Delete an assessment by ID."""
        try:
            with self.get_connection() as connection:
                cursor = connection.cursor()
                
                # Delete the assessment
                query = "DELETE FROM assessments WHERE id = %s"
                cursor.execute(query, (assessment_id,))
                
                # Check if any rows were affected
                if cursor.rowcount > 0:
                    connection.commit()
                    logger.info(f"Successfully deleted assessment {assessment_id}")
                    return True
                else:
                    logger.warning(f"No assessment found with ID {assessment_id}")
                    return False
                    
        except Error as e:
            logger.error(f"Failed to delete assessment {assessment_id}: {str(e)}")
            return False