import { AlertCircle } from 'lucide-react';

type ErrorBannerProps = {
  message: string;
};

export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 border-red-800 bg-red-900/20">
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 text-red-400" />
      <p className="text-sm text-red-800 text-red-200">{message}</p>
    </div>
  );
}
