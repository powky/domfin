import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { setAmountsHidden, useAmountsHidden } from '@/lib/privacy';

/** The eye that hides every amount on screen ("RD$x,xxx.xx"), or shows them again. */
export function AmountsToggle() {
  const { t } = useTranslation();
  const hidden = useAmountsHidden();
  return (
    <Button
      icon={hidden ? EyeOff : Eye}
      iconOnly
      accessibilityLabel={hidden ? t('privacy.show') : t('privacy.hide')}
      onPress={() => setAmountsHidden(!hidden)}
    />
  );
}
