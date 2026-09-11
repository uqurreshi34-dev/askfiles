import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type JarvisNetworkNativeModule = {
  postJson(url: string, token: string, body: string, dnsHost: string, dnsIp: string): Promise<string>;
  postFile(url: string, token: string, body: string, dnsHost: string, dnsIp: string): Promise<string>;
};

const NativeJarvisNetwork = Platform.OS === 'android'
  ? requireNativeModule<JarvisNetworkNativeModule>('JarvisNetwork')
  : null;

function native(): JarvisNetworkNativeModule {
  if (!NativeJarvisNetwork) {
    throw new Error('JARVIS native networking is only available on Android.');
  }
  return NativeJarvisNetwork;
}

export function postJson(
  url: string,
  token: string,
  body: string,
  dnsHost: string,
  dnsIp: string,
): Promise<string> {
  return native().postJson(url, token, body, dnsHost, dnsIp);
}

export function postFile(
  url: string,
  token: string,
  body: string,
  dnsHost: string,
  dnsIp: string,
): Promise<string> {
  return native().postFile(url, token, body, dnsHost, dnsIp);
}
