import { Checkbox } from '@/app/_components/ui/checkbox';
import { Label } from '@/app/_components/ui/label';
import { Badge } from '@/app/_components/ui/badge';
import { Separator } from '@/app/_components/ui/separator';
import { getStatusOrderByService, getStatusLabelsByService } from './constants';

interface Props {
  status: string;
  service?: string | null;
  // eslint-disable-next-line no-unused-vars
  onStatusChange: (status: string) => void;
}

export function ChecklistTab({ status, service, onStatusChange }: Props) {
  const statusOrder = getStatusOrderByService(service);
  const statusLabels = getStatusLabelsByService(service);

  const currentIndex = statusOrder.indexOf(status);
  const totalActive = currentIndex + 1;

  const isActive = (s: string) => statusOrder.indexOf(s) <= currentIndex;

  const isEnabled = (s: string) => {
    const idx = statusOrder.indexOf(s);
    return idx === 0 || idx === currentIndex || idx === currentIndex + 1;
  };

  const toggle = (s: string) => {
    const idx = statusOrder.indexOf(s);
    if (idx === currentIndex) {
      onStatusChange(statusOrder[idx - 1] ?? '');
    } else if (idx === currentIndex + 1 || (idx === 0 && currentIndex === -1)) {
      onStatusChange(s);
    }
  };

  return (
    <div className="space-y-4 px-1">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Progressão de Status</Label>
          <Badge variant="outline">{Math.max(0, totalActive)}</Badge>
        </div>
        <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${(Math.max(0, totalActive) / statusOrder.length) * 100}%` }}
          />
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        {statusOrder.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <Checkbox
              id={s}
              checked={isActive(s)}
              onCheckedChange={() => toggle(s)}
              disabled={!isEnabled(s)}
            />
            <Label htmlFor={s} className="text-sm text-gray-700 dark:text-zinc-300 whitespace-nowrap">
              {statusLabels[s] ?? s}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
