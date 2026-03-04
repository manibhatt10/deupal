from django.db import models


class Flashcard(models.Model):
    STATUS_CHOICES = [
        ('New', 'New'),
        ('Revision', 'Revision'),
        ('Mastered', 'Mastered'),
    ]

    german_text = models.CharField(max_length=200)
    nepali_text = models.CharField(max_length=200)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='New'
    )

    def __str__(self):
        return f"{self.german_text} → {self.nepali_text} [{self.status}]"

    class Meta:
        ordering = ['id']
