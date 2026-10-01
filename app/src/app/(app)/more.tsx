import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { MoreMenu } from '@/components/navigation';
import { UpdateNotice } from '@/features/updates';

export default function MoreRoute() {
  const { t } = useTranslation();
  return (
    <Screen header={<PageHeader title={t('nav.more')} />}>
      <UpdateNotice />
      <MoreMenu />
    </Screen>
  );
}
