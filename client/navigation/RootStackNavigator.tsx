import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import ChatScreen from "@/screens/ChatScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import CommandCenterScreen from "@/screens/CommandCenterScreen";
import CanvasScreen from "@/screens/CanvasScreen";
import CameraScreen from "@/screens/CameraScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";

export type RootStackParamList = {
  MainTabs: undefined;
  Chat: { conversationId?: string };
  Settings: undefined;
  CommandCenter: undefined;
  Canvas: undefined;
  Camera: undefined;
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
    </Stack.Navigator>
  );
}
