import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ThoughtVisibility = 'anonymous' | 'nickname' | 'firstname';

type CommentItem = {
  id: string;
  text: string;
  time: string;
};

type Thought = {
  id: string;
  text: string;
  time: string;
  likes: number;
  visibility: ThoughtVisibility;
  comments: CommentItem[];
};

const INITIAL_THOUGHTS: Thought[] = [
  {
    id: '1',
    text: 'Känner mig lite ensam ikväll. Hade varit fint att bara prata med någon en stund.',
    time: 'För 8 min sedan',
    likes: 3,
    visibility: 'anonymous',
    comments: [
      { id: 'c1', text: 'Du är inte ensam 💙', time: 'För 5 min sedan' },
      { id: 'c2', text: 'Hoppas kvällen känns lättare snart.', time: 'För 2 min sedan' },
    ],
  },
  {
    id: '2',
    text: 'Ny i Stockholm och försöker hitta folk att ta en kaffe med i helgen.',
    time: 'För 24 min sedan',
    likes: 6,
    visibility: 'nickname',
    comments: [
      { id: 'c3', text: 'Jag är också ny här!', time: 'För 10 min sedan' },
    ],
  },
  {
    id: '3',
    text: 'Pluggstress idag. Någon annan som sitter och kämpar med studier just nu?',
    time: 'För 1 tim sedan',
    likes: 2,
    visibility: 'firstname',
    comments: [],
  },
];

function getBadgeText(visibility: ThoughtVisibility) {
  if (visibility === 'anonymous') return '🌸 Anonym';
  if (visibility === 'nickname') return '💙 Smeknamn';
  return '🙂 Förnamn';
}

export default function TankarScreen() {
  const [thoughts, setThoughts] = useState<Thought[]>(INITIAL_THOUGHTS);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [visibility, setVisibility] = useState<ThoughtVisibility>('anonymous');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const remaining = useMemo(() => 500 - draftText.length, [draftText.length]);

  const toggleLike = (id: string) => {
    setThoughts((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              likes: likedIds.includes(id) ? Math.max(0, item.likes - 1) : item.likes + 1,
            }
          : item
      )
    );

    setLikedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const publishThought = () => {
    const trimmed = draftText.trim();
    if (!trimmed) return;

    const newThought: Thought = {
      id: Date.now().toString(),
      text: trimmed,
      time: 'Nyss',
      likes: 0,
      visibility,
      comments: [],
    };

    setThoughts((prev) => [newThought, ...prev]);
    setDraftText('');
    setVisibility('anonymous');
    setComposerOpen(false);
  };

  const updateCommentDraft = (thoughtId: string, value: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [thoughtId]: value,
    }));
  };

  const submitComment = (thoughtId: string) => {
    const value = (commentDrafts[thoughtId] || '').trim();
    if (!value) return;

    const newComment: CommentItem = {
      id: `${thoughtId}-${Date.now()}`,
      text: value,
      time: 'Nyss',
    };

    setThoughts((prev) =>
      prev.map((thought) =>
        thought.id === thoughtId
          ? {
              ...thought,
              comments: [...thought.comments, newComment],
            }
          : thought
      )
    );

    setCommentDrafts((prev) => ({
      ...prev,
      [thoughtId]: '',
    }));
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Tankar</Text>
            <Text style={styles.subtitle}>Ett tryggt anonymt rum för det du känner</Text>
          </View>

          <Pressable style={styles.plusButton} onPress={() => setComposerOpen(true)}>
            <Text style={styles.plusButtonText}>+</Text>
          </Pressable>
        </View>

        {thoughts.map((item) => {
          const liked = likedIds.includes(item.id);
          const commentCount = item.comments.length;
          const draftValue = commentDrafts[item.id] || '';

          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{getBadgeText(item.visibility)}</Text>
                </View>

                <Text style={styles.timeText}>{item.time}</Text>
              </View>

              <Text style={styles.thoughtText}>{item.text}</Text>

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionChip, liked && styles.actionChipActive]}
                  onPress={() => toggleLike(item.id)}
                >
                  <Text style={[styles.actionChipText, liked && styles.actionChipTextActive]}>
                    {liked ? '💙' : '🤍'} {item.likes}
                  </Text>
                </Pressable>

                <View style={styles.commentCountChip}>
                  <Text style={styles.commentCountText}>💬 {commentCount}</Text>
                </View>

                <Pressable style={styles.meetChip}>
                  <Text style={styles.meetChipText}>👋 Träffas?</Text>
                </Pressable>
              </View>

              <View style={styles.commentsWrap}>
                <Text style={styles.commentsTitle}>Kommentarer</Text>

                {item.comments.length === 0 ? (
                  <Text style={styles.noCommentsText}>Inga kommentarer ännu.</Text>
                ) : (
                  item.comments.map((comment) => (
                    <View key={comment.id} style={styles.commentBubble}>
                      <Text style={styles.commentText}>{comment.text}</Text>
                      <Text style={styles.commentTime}>{comment.time}</Text>
                    </View>
                  ))
                )}

                <View style={styles.commentInputRow}>
                  <TextInput
                    value={draftValue}
                    onChangeText={(value) => updateCommentDraft(item.id, value)}
                    placeholder="Skriv en kommentar..."
                    placeholderTextColor="#7A8AAA"
                    style={styles.commentInput}
                  />

                  <Pressable
                    style={[
                      styles.commentSendButton,
                      draftValue.trim().length === 0 && styles.commentSendButtonDisabled,
                    ]}
                    onPress={() => submitComment(item.id)}
                    disabled={draftValue.trim().length === 0}
                  >
                    <Text style={styles.commentSendButtonText}>Skicka</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

        <Text style={styles.footerHelp}>Mår du dåligt? Mind 90101 · 1177</Text>
      </ScrollView>

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Skriv en tanke</Text>

              <Pressable
                style={[
                  styles.publishButton,
                  draftText.trim().length === 0 && styles.publishButtonDisabled,
                ]}
                onPress={publishThought}
                disabled={draftText.trim().length === 0}
              >
                <Text style={styles.publishButtonText}>Publicera</Text>
              </Pressable>
            </View>

            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="Skriv vad du känner eller tänker..."
              placeholderTextColor="#7A8AAA"
              style={styles.textArea}
              multiline
              maxLength={500}
            />

            <Text style={styles.counterText}>{remaining} tecken kvar</Text>

            <Text style={styles.modalSectionTitle}>Välj anonymitetsnivå</Text>

            <View style={styles.visibilityRow}>
              <Pressable
                style={[
                  styles.visibilityChip,
                  visibility === 'anonymous' && styles.visibilityChipActive,
                ]}
                onPress={() => setVisibility('anonymous')}
              >
                <Text
                  style={[
                    styles.visibilityChipText,
                    visibility === 'anonymous' && styles.visibilityChipTextActive,
                  ]}
                >
                  Helt anonymt
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.visibilityChip,
                  visibility === 'nickname' && styles.visibilityChipActive,
                ]}
                onPress={() => setVisibility('nickname')}
              >
                <Text
                  style={[
                    styles.visibilityChipText,
                    visibility === 'nickname' && styles.visibilityChipTextActive,
                  ]}
                >
                  Avatar + smeknamn
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.visibilityChip,
                  visibility === 'firstname' && styles.visibilityChipActive,
                ]}
                onPress={() => setVisibility('firstname')}
              >
                <Text
                  style={[
                    styles.visibilityChipText,
                    visibility === 'firstname' && styles.visibilityChipTextActive,
                  ]}
                >
                  Öppet förnamn
                </Text>
              </Pressable>
            </View>

            <Pressable style={styles.closeLink} onPress={() => setComposerOpen(false)}>
              <Text style={styles.closeLinkText}>Stäng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    color: '#1B2B4B',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#7A8AAA',
    fontSize: 14,
    maxWidth: 260,
    lineHeight: 20,
  },
  plusButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1C5E52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: -2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    padding: 18,
    marginBottom: 14,
    shadowColor: '#1B2B4B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badge: {
    backgroundColor: '#E8F4F0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: '#1C5E52',
    fontSize: 12,
    fontWeight: '800',
  },
  timeText: {
    color: '#7A8AAA',
    fontSize: 12,
    fontWeight: '700',
  },
  thoughtText: {
    color: '#333333',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  actionChip: {
    backgroundColor: '#EEF1F8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 8,
  },
  actionChipActive: {
    backgroundColor: '#E8F4F0',
  },
  actionChipText: {
    color: '#1B2B4B',
    fontSize: 14,
    fontWeight: '800',
  },
  actionChipTextActive: {
    color: '#1C5E52',
  },
  commentCountChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 8,
  },
  commentCountText: {
    color: '#1B2B4B',
    fontSize: 14,
    fontWeight: '800',
  },
  meetChip: {
    backgroundColor: '#FEF4E8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  meetChipText: {
    color: '#C07020',
    fontSize: 14,
    fontWeight: '800',
  },
  commentsWrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F8',
    paddingTop: 14,
  },
  commentsTitle: {
    color: '#1B2B4B',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  noCommentsText: {
    color: '#7A8AAA',
    fontSize: 14,
    marginBottom: 10,
  },
  commentBubble: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  commentText: {
    color: '#333333',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  commentTime: {
    color: '#7A8AAA',
    fontSize: 11,
    fontWeight: '700',
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F0F2F8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#1B2B4B',
    fontSize: 14,
    marginRight: 10,
  },
  commentSendButton: {
    backgroundColor: '#1C5E52',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commentSendButtonDisabled: {
    opacity: 0.45,
  },
  commentSendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  footerHelp: {
    color: '#7A8AAA',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(27, 43, 75, 0.18)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#DDE2EF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#1B2B4B',
    fontSize: 24,
    fontWeight: '800',
  },
  publishButton: {
    backgroundColor: '#1C5E52',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  publishButtonDisabled: {
    opacity: 0.45,
  },
  publishButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  textArea: {
    marginTop: 16,
    backgroundColor: '#F0F2F8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE2EF',
    minHeight: 140,
    color: '#1B2B4B',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlignVertical: 'top',
  },
  counterText: {
    color: '#7A8AAA',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 14,
  },
  modalSectionTitle: {
    color: '#1B2B4B',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  visibilityChip: {
    backgroundColor: '#EEF1F8',
    borderWidth: 1,
    borderColor: '#DDE2EF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  visibilityChipActive: {
    backgroundColor: '#1C5E52',
    borderColor: '#1C5E52',
  },
  visibilityChipText: {
    color: '#1B2B4B',
    fontSize: 13,
    fontWeight: '800',
  },
  visibilityChipTextActive: {
    color: '#FFFFFF',
  },
  closeLink: {
    alignSelf: 'center',
    marginTop: 18,
  },
  closeLinkText: {
    color: '#7A8AAA',
    fontSize: 14,
    fontWeight: '700',
  },
});