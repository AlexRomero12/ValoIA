'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CompareTab } from '@/components/team/CompareTab';
import { CompositionsTab } from '@/components/team/CompositionsTab';
import { isEquipoTab, type EquipoTab } from '@/components/team/EquipoTabs';

export default function EquipoPage() {
  // `useSearchParams` exige un Suspense boundary en páginas prerenderizadas.
  return (
    <Suspense fallback={null}>
      <EquipoHub />
    </Suspense>
  );
}

function EquipoHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: EquipoTab = isEquipoTab(tabParam) ? tabParam : 'comparar';
  const goTab = (next: EquipoTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'comparar') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return tab === 'composiciones'
    ? <CompositionsTab tab={tab} onTab={goTab} />
    : <CompareTab tab={tab} onTab={goTab} />;
}
