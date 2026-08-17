import { useState } from 'react';
import { View, Image, type ImageStyle, type StyleProp } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ThumbProps {
  uri: string;
  style: StyleProp<ImageStyle>;
  bg?: string;      // tile background behind the placeholder (pass theme colour)
  iconColor?: string;
}

// Image thumbnail with a broken-image fallback, matching the native browse /
// mediagrid views (Glide's ic_menu_report_image on failure). On load error we
// render a broken-image icon instead of a blank tile.
export default function Thumb({ uri, style, bg = '#2a2a2a', iconColor = '#9aa0a6' }: ThumbProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: bg }]}>
        <MaterialIcons name="broken-image" size={26} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}
