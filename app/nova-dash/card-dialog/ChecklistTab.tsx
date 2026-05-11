import { Checkbox } from '@/app/_components/ui/checkbox';
import { Label } from '@/app/_components/ui/label';
import { Badge } from '@/app/_components/ui/badge';
import { Separator } from '@/app/_components/ui/separator';
import { STATUS_ORDER, STATUS_LABELS } from './constants';

interface Props {
  status: string;
  // eslint-disable-next-line no-unused-vars
  onStatusChange: (status: string) => void;
}

export function ChecklistTab({ status, onStatusChange }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(status as typeof STATUS_ORDER[number]);
  const totalActive = currentIndex + 1;

  const isActive = (s: string) =>
    STATUS_ORDER.indexOf(s as typeof STATUS_ORDER[number]) <= currentIndex;

  const isEnabled = (s: string) => {
    const idx = STATUS_ORDER.indexOf(s as typeof STATUS_ORDER[number]);
    return idx === 0 || idx === currentIndex || idx === currentIndex + 1;
  };

  const toggle = (s: string) => {
    const idx = STATUS_ORDER.indexOf(s as typeof STATUS_ORDER[number]);
    if (idx === currentIndex) {
      onStatusChange(STATUS_ORDER[idx - 1] ?? '');
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
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${(Math.max(0, totalActive) / STATUS_ORDER.length) * 100}%` }}
          />
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <Checkbox
              id={s}
              checked={isActive(s)}
              onCheckedChange={() => toggle(s)}
              disabled={!isEnabled(s)}
            />
            <Label htmlFor={s} className="text-sm text-gray-700 whitespace-nowrap">
              {STATUS_LABELS[s]}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}