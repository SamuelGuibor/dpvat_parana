import { Button } from "./ui/button";
import { Trash, Eye } from 'lucide-react';

interface ToggleFixedButtonProps {
    fixed: boolean;
    onToggle: () => void;
}

export const ToggleFixedButton = ({ fixed, onToggle }: ToggleFixedButtonProps) => {
    return (
        <Button onClick={onToggle} variant="outline" size="icon" className="w-full sm:w-auto">
            {fixed ? <Trash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </Button>
    );
};