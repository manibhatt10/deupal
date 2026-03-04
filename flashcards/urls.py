from django.urls import path
from . import views

app_name = 'flashcards'

urlpatterns = [
    path('', views.study, name='study'),
    path('update/', views.update_status, name='update_status'),
]
