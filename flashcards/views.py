import json

from django.contrib.auth.decorators import login_required
from django.db.models import Case, When, Value, IntegerField, Subquery, OuterRef, CharField, Q
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST

from .models import Flashcard, UserFlashcardProgress


def login_view(request):
    """Show the login page, or redirect to study if already authenticated."""
    if request.user.is_authenticated:
        return redirect('flashcards:study')
    return render(request, 'flashcards/login.html')


def study(request):
    """
    Serve the study page. Cards are fetched one-at-a-time via the API.
    We only pass the aggregate stats for the initial render.
    """
    user = request.user
    total = Flashcard.objects.count()
    if user.is_authenticated:
        mastered = UserFlashcardProgress.objects.filter(user=user, status='Mastered').count()
        revision = UserFlashcardProgress.objects.filter(user=user, status='Revision').count()
    else:
        mastered = 0
        revision = 0
    new_count = total - mastered - revision

    context = {
        'total': total,
        'new_count': new_count,
        'revision_count': revision,
        'mastered_count': mastered,
        'is_guest': not user.is_authenticated,
    }
    return render(request, 'flashcards/study.html', context)


@login_required
def get_card(request):
    """
    Return a single card as JSON.
    Query params:
      - direction: 'next' (default) or 'prev'
      - current_id: the id of the card currently being viewed (optional)
    Priority order: New → Revision → Mastered.
    """
    user = request.user
    direction = request.GET.get('direction', 'next')
    current_id = request.GET.get('current_id')
    filter_status = request.GET.get('filter_status')

    # Annotate each flashcard with the user's status (default 'New')
    cards = Flashcard.objects.annotate(
        user_status=Subquery(
            UserFlashcardProgress.objects.filter(
                user=user, flashcard=OuterRef('pk')
            ).values('status')[:1],
            output_field=CharField(),
        ),
        priority=Case(
            When(user_status='Revision', then=Value(1)),
            When(user_status='Mastered', then=Value(2)),
            default=Value(0),  # New or no progress record
            output_field=IntegerField(),
        ),
    ).order_by('priority', 'id')

    if filter_status in ('New', 'Revision', 'Mastered'):
        if filter_status == 'New':
            cards = cards.filter(Q(user_status='New') | Q(user_status__isnull=True))
        else:
            cards = cards.filter(user_status=filter_status)

    if current_id:
        try:
            current_id = int(current_id)
        except (ValueError, TypeError):
            current_id = None

    if current_id and direction == 'next':
        try:
            current = cards.get(pk=current_id)
            cur_priority = current.priority
            next_card = cards.filter(
                id__gt=current_id, priority=cur_priority
            ).first() or cards.filter(
                priority__gt=cur_priority
            ).first()
            if next_card is None:
                next_card = cards.first()
            card = next_card
        except Flashcard.DoesNotExist:
            card = cards.first()
    elif current_id and direction == 'prev':
        try:
            current = cards.get(pk=current_id)
            cur_priority = current.priority
            prev_card = cards.filter(
                id__lt=current_id, priority=cur_priority
            ).last() or cards.filter(
                priority__lt=cur_priority
            ).last()
            if prev_card is None:
                prev_card = cards.last()
            card = prev_card
        except Flashcard.DoesNotExist:
            card = cards.first()
    else:
        card = cards.first()

    if card is None:
        return JsonResponse({'success': False, 'error': 'No cards found'}, status=404)

    status = card.user_status if card.user_status else 'New'

    # Figure out the position of this card in the ordered list
    card_ids = list(cards.values_list('id', flat=True))
    try:
        position = card_ids.index(card.id) + 1
    except ValueError:
        position = 1

    return JsonResponse({
        'success': True,
        'card': {
            'id': card.id,
            'german_text': card.german_text,
            'nepali_text': card.nepali_text,
            'english_text': card.english_text,
            'status': status,
        },
        'position': position,
        'total': len(card_ids),
    })


@login_required
@require_POST
def update_status(request):
    """Update a flashcard's per-user status via AJAX."""
    try:
        data = json.loads(request.body)
        card_id = data.get('card_id')
        new_status = data.get('new_status')

        if new_status not in ('New', 'Revision', 'Mastered'):
            return JsonResponse({'success': False, 'error': 'Invalid status'}, status=400)

        card = Flashcard.objects.get(pk=card_id)

        progress, _ = UserFlashcardProgress.objects.get_or_create(
            user=request.user, flashcard=card,
            defaults={'status': new_status},
        )
        if progress.status != new_status:
            progress.status = new_status
            progress.save()

        total = Flashcard.objects.count()
        mastered = UserFlashcardProgress.objects.filter(user=request.user, status='Mastered').count()
        revision = UserFlashcardProgress.objects.filter(user=request.user, status='Revision').count()
        new_count = total - mastered - revision

        return JsonResponse({
            'success': True,
            'new_count': new_count,
            'revision_count': revision,
            'mastered_count': mastered,
            'total': total,
        })

    except Flashcard.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Card not found'}, status=404)
    except (json.JSONDecodeError, TypeError):
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)


@login_required
def get_stats(request):
    """Return per-user progress stats as JSON."""
    total = Flashcard.objects.count()
    mastered = UserFlashcardProgress.objects.filter(user=request.user, status='Mastered').count()
    revision = UserFlashcardProgress.objects.filter(user=request.user, status='Revision').count()
    new_count = total - mastered - revision

    return JsonResponse({
        'total': total,
        'new_count': new_count,
        'revision_count': revision,
        'mastered_count': mastered,
    })


@login_required
def get_word_list(request):
    """Return all words for a given status ('New', 'Revision', 'Mastered') as JSON."""
    user = request.user
    status_filter = request.GET.get('status')

    if status_filter not in ('New', 'Revision', 'Mastered'):
        return JsonResponse({'success': False, 'error': 'Invalid status'}, status=400)

    # Annotate with user status
    cards = Flashcard.objects.annotate(
        user_status=Subquery(
            UserFlashcardProgress.objects.filter(
                user=user, flashcard=OuterRef('pk')
            ).values('status')[:1],
            output_field=CharField(),
        )
    )

    if status_filter == 'New':
        # New is either 'New' specifically recorded or NULL progress
        filtered_cards = cards.filter(Q(user_status='New') | Q(user_status__isnull=True))
    else:
        filtered_cards = cards.filter(user_status=status_filter)

    # Order by ID or alphabetically? Let's go with ID for consistency.
    data = list(filtered_cards.values('id', 'german_text', 'nepali_text', 'english_text'))
    
    return JsonResponse({
        'success': True,
        'status': status_filter,
        'cards': data,
        'count': len(data)
    })


def all_cards(request):
    """Return all cards for guest local storage."""
    cards = Flashcard.objects.all().values('id', 'german_text', 'nepali_text', 'english_text')
    return JsonResponse({'success': True, 'cards': list(cards)})
