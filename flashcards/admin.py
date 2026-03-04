from django.contrib import admin
from .models import Flashcard


@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ('german_text', 'nepali_text', 'status')
    list_filter = ('status',)
    search_fields = ('german_text', 'nepali_text')
