import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import ChatScreen from "@/screens/ChatScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import CommandCenterScreen from "@/screens/CommandCenterScreen";
import CanvasScreen from "@/screens/CanvasScreen";
import CameraScreen from "@/screens/CameraScreen";
import LiveThoughtsScreen from "@/screens/LiveThoughtsScreen";
import TokenCostsScreen from "@/screens/TokenCostsScreen";
import SystemMetricsScreen from "@/screens/SystemMetricsScreen";
import MissionControlScreen from "@/screens/MissionControlScreen";
import MemoryFeedScreen from "@/screens/MemoryFeedScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";

export type RootStackParamList = {
  MainTabs: undefined;
  Chat: { conversationId?: string };
  Settings: undefined;
  CommandCenter: undefined;
  Canvas: undefined;
  Camera: undefined;
  LiveThoughts: undefined;
  TokenCosts: undefined;
  SystemMetrics: undefined;
  MissionControl: undefined;
  MemoryFeed: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          headerTitle: () => <HeaderTitle title="I-CLAW" />,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="CommandCenter"
        component={CommandCenterScreen}
        options={{
          headerTitle: "Command Center",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="Canvas"
        component={CanvasScreen}
        options={{
          headerTitle: "Canvas",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: "modal",
          headerTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="LiveThoughts"
        component={LiveThoughtsScreen}
        options={{
          headerTitle: "Live Thoughts",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="TokenCosts"
        component={TokenCostsScreen}
        options={{
          headerTitle: "Token Costs",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="SystemMetrics"
        component={SystemMetricsScreen}
        options={{
          headerTitle: "System Metrics",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="MissionControl"
        component={MissionControlScreen}
        options={{
          headerTitle: "Mission Control",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="MemoryFeed"
        component={MemoryFeedScreen}
        options={{
          headerTitle: "Memory Feed",
          headerBackTitle: "Back",
        }}
      />
    </Stack.Navigator>
  );
}
