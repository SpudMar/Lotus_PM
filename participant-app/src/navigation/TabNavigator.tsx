/**
 * Bottom tab navigator for the Lotus PM Participant App.
 * REQ-012: WCAG 2.1 AA — all tabs have accessible labels and hints.
 */

import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text } from 'react-native'
import { BudgetScreen } from '@/screens/BudgetScreen'
import { InvoicesScreen } from '@/screens/InvoicesScreen'
import { MessagesScreen } from '@/screens/MessagesScreen'
import { ProfileScreen } from '@/screens/ProfileScreen'
import type { AuthSession } from '@/types'

const Tab = createBottomTabNavigator()

// Simple icon components — replace with a real icon library when assets are available
function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }): React.JSX.Element {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }} accessibilityElementsHidden>
      {symbol}
    </Text>
  )
}

interface Props {
  session: AuthSession
  onSignOut: () => void
}

export function TabNavigator({ session, onSignOut }: Props): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#2563eb' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          title: 'My Budget',
          tabBarAccessibilityLabel: 'Budget tab',
          tabBarIcon: ({ focused }) => <TabIcon symbol="💰" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Invoices"
        component={InvoicesScreen}
        options={{
          title: 'Invoices',
          tabBarAccessibilityLabel: 'Invoices tab',
          tabBarIcon: ({ focused }) => <TabIcon symbol="🧾" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Messages',
          tabBarAccessibilityLabel: 'Messages tab',
          tabBarIcon: ({ focused }) => <TabIcon symbol="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ focused }) => <TabIcon symbol="👤" focused={focused} />,
        }}
      >
        {() => <ProfileScreen session={session} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  )
}
