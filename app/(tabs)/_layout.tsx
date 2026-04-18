import { Tabs } from 'expo-router';
import { View } from 'react-native';

function TabIcon({ color, shape }: { color: string; shape: 'home' | 'folder' | 'search' | 'cloud' }) {
  if (shape === 'home') return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
      <View style={{ width: 18, height: 12, backgroundColor: color, borderRadius: 2, marginTop: -1 }} />
    </View>
  );
  if (shape === 'folder') return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ position: 'absolute', top: 4, left: 0, width: 10, height: 5, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
      <View style={{ width: 22, height: 14, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
  if (shape === 'search') return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: color }} />
      <View style={{ position: 'absolute', bottom: 2, right: 2, width: 6, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
  if (shape === 'cloud') return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 20, height: 10, backgroundColor: color, borderRadius: 5 }} />
      <View style={{ position: 'absolute', top: 4, left: 3, width: 8, height: 8, backgroundColor: color, borderRadius: 4 }} />
      <View style={{ position: 'absolute', top: 4, right: 3, width: 10, height: 10, backgroundColor: color, borderRadius: 5 }} />
    </View>
  );
  return null;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
            borderTopWidth: 0.5,
            borderTopColor: '#D3D1C7',
            backgroundColor: '#fff',
          },
        tabBarActiveTintColor: '#185FA5',
        tabBarInactiveTintColor: '#888780',
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon color={color} shape="home" />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color }) => <TabIcon color={color} shape="folder" />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <TabIcon color={color} shape="search" />,
        }}
      />
      <Tabs.Screen
        name="cloud"
        options={{
          title: 'Cloud',
          tabBarIcon: ({ color }) => <TabIcon color={color} shape="cloud" />,
        }}
      />
    </Tabs>
  );
}
