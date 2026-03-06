from django.contrib import admin
from .models import Flashcard, UserFlashcardProgress


@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ('german_text', 'nepali_text', 'english_text', 'status')
    list_filter = ('status',)
    search_fields = ('german_text', 'nepali_text', 'english_text')


@admin.register(UserFlashcardProgress)
class UserFlashcardProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'flashcard', 'status', 'updated_at')
    list_filter = ('status', 'user')
    search_fields = ('user__username', 'flashcard__german_text')
