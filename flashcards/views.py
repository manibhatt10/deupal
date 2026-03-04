import json

from django.db.models import Case, When, Value, IntegerField
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .models import Flashcard


def study(request):
    """
    Serve 10 flashcards prioritised: New → Revision → Mastered.
    Also pass overall stats for the progress bar.
    """
    cards = Flashcard.objects.annotate(
        priority=Case(
            When(status='New', then=Value(0)),
            When(status='Revision', then=Value(1)),
            When(status='Mastered', then=Value(2)),
            output_field=IntegerField(),
        )
    ).order_by('priority', '?')[:10]

    total = Flashcard.objects.count()
    new_count = Flashcard.objects.filter(status='New').count()
    revision_count = Flashcard.objects.filter(status='Revision').count()
    mastered_count = Flashcard.objects.filter(status='Mastered').count()

    context = {
        'cards': cards,
        'total': total,
        'new_count': new_count,
        'revision_count': revision_count,
        'mastered_count': mastered_count,
    }
    return render(request, 'flashcards/study.html', context)


@require_POST
def update_status(request):
    """Update a flashcard's status via AJAX."""
    try:
        data = json.loads(request.body)
        card_id = data.get('card_id')
        new_status = data.get('new_status')

        if new_status not in ('New', 'Revision', 'Mastered'):
            return JsonResponse({'success': False, 'error': 'Invalid status'}, status=400)

        card = Flashcard.objects.get(pk=card_id)
        card.status = new_status
        card.save()

        # Return updated counts too
        total = Flashcard.objects.count()
        return JsonResponse({
            'success': True,
            'new_count': Flashcard.objects.filter(status='New').count(),
            'revision_count': Flashcard.objects.filter(status='Revision').count(),
            'mastered_count': Flashcard.objects.filter(status='Mastered').count(),
            'total': total,
        })

    except Flashcard.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Card not found'}, status=404)
    except (json.JSONDecodeError, TypeError):
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
