from django.conf import settings
from django.db import models


class Flashcard(models.Model):
    STATUS_CHOICES = [
        ('New', 'New'),
        ('Revision', 'Revision'),
        ('Mastered', 'Mastered'),
    ]

    german_text = models.CharField(max_length=200)
    nepali_text = models.CharField(max_length=200)
    english_text = models.CharField(max_length=200, default='')
    # Legacy field – kept for backward compat; per-user progress is in UserFlashcardProgress
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='New'
    )

    def __str__(self):
        return f"{self.german_text} → {self.nepali_text} [{self.status}]"

    class Meta:
        ordering = ['id']


class UserFlashcardProgress(models.Model):
    """Per-user progress for each flashcard."""
    STATUS_CHOICES = Flashcard.STATUS_CHOICES

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='flashcard_progress',
    )
    flashcard = models.ForeignKey(
        Flashcard,
        on_delete=models.CASCADE,
        related_name='user_progress',
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='New'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'flashcard')
        ordering = ['flashcard__id']

    def __str__(self):
        return f"{self.user.username} – {self.flashcard.german_text}: {self.status}"
