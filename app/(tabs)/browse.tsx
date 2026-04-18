import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BrowseScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Browse</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 26, fontWeight: '500', color: '#111' },
});
