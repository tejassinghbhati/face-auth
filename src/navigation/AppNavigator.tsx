import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {SplashScreen} from '../screens/SplashScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {EnrollmentScreen} from '../screens/EnrollmentScreen';
import {EnrollmentFormScreen} from '../screens/EnrollmentFormScreen';
import {AuthenticationScreen} from '../screens/AuthenticationScreen';
import {ResultScreen} from '../screens/ResultScreen';
import {AdminScreen} from '../screens/AdminScreen';
import {COLORS} from '../utils/constants';
import type {RootStackParamList} from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: COLORS.background},
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Enrollment" component={EnrollmentScreen} />
        <Stack.Screen name="EnrollmentForm" component={EnrollmentFormScreen} />
        <Stack.Screen name="Authentication" component={AuthenticationScreen} />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{animation: 'fade'}}
        />
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
