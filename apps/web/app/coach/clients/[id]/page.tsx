'use client';

import { useParams } from 'next/navigation';
import { ClientWeek } from '@/components/coach/ClientWeek';

export default function CoachClientPage() {
  const { id } = useParams<{ id: string }>();
  return <ClientWeek clientId={id} />;
}
