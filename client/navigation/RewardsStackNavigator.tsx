import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import RewardsScreen from "@/screens/RewardsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type RewardsStackParamList = {
  Rewards: undefined;
};

const Stack = createNativeStackNavigator<RewardsStackParamList>();

export default function RewardsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ headerTitle: "Rewards" }}
      />
    </Stack.Navigator>
  );
}
