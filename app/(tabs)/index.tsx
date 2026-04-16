import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import SwipeDeck from '../../components/SwipeDeck';
import { withuColors, withuSpacing } from '../../src/theme/withuTheme';
import {
  WithUAvatar,
  WithUBadge,
  WithUCard,
  WithUPage,
  WithUScreen,
  WithUSubtitle,
  WithUTopBar,
} from '../../src/components/withu/WithUPrimitives';

export default function FindScreen() {
  return (
    <WithUScreen>
      <WithUTopBar
        title="WithU"
        subtitle="Du är aldrig ensam."
        right={<WithUAvatar emoji="😊" size={34} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <WithUPage style={styles.page}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Hitta</Text>
            <Text style={styles.heroSubtitle}>
              Hitta personer som matchar dina intressen, din åldersgrupp och det
              du vill göra just nu.
            </Text>

            <View style={styles.badgeRow}>
              <WithUBadge title="✓ Verifierade profiler" variant="verified" />
              <WithUBadge title="Trygg matchning" variant="coral" />
            </View>
          </View>

          <WithUCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Så fungerar det</Text>
            <WithUSubtitle style={styles.infoSubtitle}>
              Svep bland profiler och välj vilka du vill lära känna. När båda gillar
              varandra blir det en match och ni kan börja chatta.
            </WithUSubtitle>

            <View style={styles.tipRow}>
              <View style={styles.tipPill}>
                <Text style={styles.tipPillText}>💙 Gilla</Text>
              </View>

              <View style={styles.tipPill}>
                <Text style={styles.tipPillText}>✕ Passa</Text>
              </View>

              <View style={styles.tipPill}>
                <Text style={styles.tipPillText}>🔐 Tryggt</Text>
              </View>
            </View>
          </WithUCard>

          <View style={styles.deckWrap}>
            <SwipeDeck />
          </View>
        </WithUPage>
      </ScrollView>
    </WithUScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: withuColors.cream,
  },
  content: {
    paddingBottom: 36,
  },
  page: {
    paddingTop: withuSpacing.lg,
  },
  heroBlock: {
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: withuColors.muted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  infoCard: {
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: withuColors.navy,
    marginBottom: 8,
  },
  infoSubtitle: {
    lineHeight: 22,
  },
  tipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  tipPill: {
    backgroundColor: withuColors.soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tipPillText: {
    color: withuColors.navy,
    fontSize: 12,
    fontWeight: '700',
  },
  deckWrap: {
    marginBottom: 18,
  },
});