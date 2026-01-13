"""
Service for creating images with bounding boxes for different categories.
"""
import logging
from typing import List, Dict, Any, Optional
from PIL import Image, ImageDraw, ImageFont
import os
from datetime import datetime

from services.detection_service import Detection
from config import UPLOAD_FOLDER

logger = logging.getLogger(__name__)

class BoundingBoxService:
    """Service for creating images with category-specific bounding boxes."""
    
    def __init__(self):
        self.colors = {
            'Ripe': (76, 175, 80),      # Green
            'Unripe': (255, 152, 0),    # Orange  
            'Rotten': (244, 67, 54)     # Red
        }
        
    def create_category_images(self, original_image: Image.Image, detections: List[Detection], 
                             base_filename: str, source: str) -> Dict[str, str]:
        """
        Create separate images with bounding boxes for each category.
        
        Args:
            original_image: The original PIL image
            detections: List of Detection objects
            base_filename: Base filename for the images
            source: Source of the image (upload, camera_ws, etc.)
            
        Returns:
            Dictionary with category -> image_url mappings
        """
        category_urls = {}
        
        # Create images for each category
        for category in ['Ripe', 'Unripe', 'Rotten']:
            try:
                # Create a copy of the original image
                image_copy = original_image.copy()
                
                # Filter detections for this category
                category_detections = [d for d in detections if d.label == category]
                
                if category_detections:
                    # Draw bounding boxes for this category
                    self._draw_bounding_boxes(image_copy, category_detections)
                
                # Save the category-specific image
                category_filename = self._generate_category_filename(base_filename, category, source)
                category_path = os.path.join(UPLOAD_FOLDER, category_filename)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(category_path), exist_ok=True)
                
                # Save image
                image_copy.save(category_path, quality=95)
                
                # Generate URL
                category_url = f"/static/uploads/{category_filename}"
                category_urls[category] = category_url
                
                logger.info(f"Created {category} image: {category_filename}")
                
            except Exception as e:
                logger.error(f"Failed to create {category} image: {str(e)}")
                category_urls[category] = None
        
        return category_urls
    
    def _draw_bounding_boxes(self, image: Image.Image, detections: List[Detection]) -> None:
        """Draw bounding boxes on the image."""
        draw = ImageDraw.Draw(image)
        
        # Try to load a font, fallback to default if not available
        try:
            font = ImageFont.truetype("arial.ttf", 16)
        except:
            font = ImageFont.load_default()
        
        for detection in detections:
            # Get color for this detection
            color = self.colors.get(detection.label, (255, 255, 255))
            
            # Convert relative coordinates to absolute
            img_width, img_height = image.size
            x1 = int(detection.box_relative[0] * img_width)
            y1 = int(detection.box_relative[1] * img_height)
            x2 = int(detection.box_relative[2] * img_width)
            y2 = int(detection.box_relative[3] * img_height)
            
            # Draw bounding box
            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
            
            # Draw label background
            label_text = f"{detection.label} ({detection.score:.1%})"
            
            # Get text size
            bbox = draw.textbbox((0, 0), label_text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # Draw label background rectangle
            label_x = x1
            label_y = max(0, y1 - text_height - 5)
            draw.rectangle([label_x, label_y, label_x + text_width + 10, label_y + text_height + 5], 
                          fill=color)
            
            # Draw label text
            draw.text((label_x + 5, label_y + 2), label_text, fill=(255, 255, 255), font=font)
    
    def _generate_category_filename(self, base_filename: str, category: str, source: str) -> str:
        """Generate filename for category-specific image."""
        # Remove extension from base filename
        name, ext = os.path.splitext(base_filename)
        
        # Add category and timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{name}_{category.lower()}_{timestamp}{ext}"
