import { APP_NAME, EXCHANGES } from '@zuo/types';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>Mobile shell — features land post-web-launch.</Text>
      <Text style={styles.exchanges}>{EXCHANGES.join(' · ')}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
  },
  exchanges: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
