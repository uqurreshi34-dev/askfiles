import { MediaSlideshowViewProps } from './MediaSlideshow.types';

// MediaSlideshowView is not available on the web platform.
export default function MediaSlideshowView(_props: MediaSlideshowViewProps) {
  throw new Error('MediaSlideshowView is not available on the web platform.');
}
