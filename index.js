/**
 * NHAI Face Auth - Entry Point
 * Offline Facial Recognition & Liveness Detection System
 */
import 'react-native-get-random-values'; // Must be first for UUID/crypto
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
