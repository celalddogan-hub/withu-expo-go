import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

type Props = {
  uri: string;
  isMine: boolean;
  sentAt?: string | null;
};

function formatSeconds(value?: number | null) {
  const total = Math.max(0, Math.floor(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ChatAudioBubble({ uri, isMine, sentAt }: Props) {
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = !!status.playing;
  const currentTime = Math.max(0, status.currentTime || 0);
  const duration = Math.max(currentTime, status.duration || 0);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const handleToggle = async () => {
    if (isPlaying) {
      player.pause();
      return;
    }

    if (duration > 0 && currentTime >= duration - 0.2) {
      await player.seekTo(0);
    }

    player.play();
  };

  const timeLabel = sentAt
    ? new Date(sentAt).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <View style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperOther]}>
      <Pressable
        onPress={handleToggle}
        style={[styles.playButton, isMine ? styles.playButtonMine : styles.playButtonOther]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={14}
          color={isMine ? '#1C5E52' : '#FFFFFF'}
        />
      </Pressable>

      <View style={styles.waveArea}>
        <View style={[styles.track, isMine ? styles.trackMine : styles.trackOther]}>
          <View
            style={[
              styles.fill,
              isMine ? styles.fillMine : styles.fillOther,
              { width: `${Math.max(8, progress * 100)}%` },
            ]}
          />
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, isMine ? styles.metaTextMine : styles.metaTextOther]}>
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </Text>

          {!!timeLabel && (
            <Text style={[styles.metaText, isMine ? styles.metaTextMine : styles.metaTextOther]}>
              {timeLabel}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 210,
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrapperMine: {
    backgroundColor: '#1C5E52',
    borderBottomRightRadius: 4,
  },
  wrapperOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF4',
    borderBottomLeftRadius: 4,
  },
  playButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playButtonMine: {
    backgroundColor: '#FFFFFF',
  },
  playButtonOther: {
    backgroundColor: '#1C5E52',
  },
  waveArea: {
    flex: 1,
  },
  track: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  trackMine: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  trackOther: {
    backgroundColor: '#E3E8F1',
  },
  fill: {
    height: 4,
    borderRadius: 999,
  },
  fillMine: {
    backgroundColor: '#FFFFFF',
  },
  fillOther: {
    backgroundColor: '#1C5E52',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaText: {
    fontSize: 9,
    fontWeight: '700',
  },
  metaTextMine: {
    color: 'rgba(255,255,255,0.72)',
  },
  metaTextOther: {
    color: '#A0A8C0',
  },
});