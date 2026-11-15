import { View } from './Themed';

const BottomSpacing = ({ space = 100 }: { space?: number }) => (
  <View style={{ height: Math.max(space, 85) }} />
);

export default BottomSpacing;
