import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { withuColors } from '../../src/theme/withuTheme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  active,
  inactive,
  color,
  focused,
}: {
  active: IconName;
  inactive: IconName;
  color: string;
  focused: boolean;
}) {
  return <Ionicons name={focused ? active : inactive} size={23} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: withuColors.teal,
        tabBarInactiveTintColor: '#7A8499',
        tabBarStyle: {
          height: 88,
          paddingTop: 9,
          paddingBottom: 18,
          borderTopColor: '#E8ECF3',
          backgroundColor: '#FFFFFF',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Upptäck',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon active="compass" inactive="compass-outline" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="now"
        options={{
          title: 'Nära',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon active="location" inactive="location-outline" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="feed"
        options={{
          title: 'Flöde',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon active="newspaper" inactive="newspaper-outline" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="matches"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chatt',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              active="chatbubble-ellipses"
              inactive="chatbubble-ellipses-outline"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Tankar',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon active="leaf" inactive="leaf-outline" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="nearby"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon active="person" inactive="person-outline" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
