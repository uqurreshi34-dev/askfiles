import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/modules/appLanguage';
import { homeText } from '@/modules/homeText';

export default function TabsLayout() {
  const { dark, colors } = useTheme();
  const t = homeText(useLanguage());

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        },
        tabBarActiveTintColor: '#185FA5',
        tabBarInactiveTintColor: dark ? '#6B6B65' : '#888780',
        tabBarLabelStyle: { fontSize: 11 },
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabHome,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t.tabBrowse,
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t.tabSearch,
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cloud"
        options={{
          title: t.tabCloud,
          tabBarIcon: ({ color, size }) => <Ionicons name="cloud-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
