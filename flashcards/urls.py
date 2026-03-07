from django.urls import path
from . import views

app_name = 'flashcards'

urlpatterns = [
    path('', views.login_view, name='login'),
    path('study/', views.study, name='study'),
    path('update/', views.update_status, name='update_status'),
    path('api/card/', views.get_card, name='get_card'),
    path('api/stats/', views.get_stats, name='get_stats'),
    path('api/all_cards/', views.all_cards, name='all_cards'),
]
