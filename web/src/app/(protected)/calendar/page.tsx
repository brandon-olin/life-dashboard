import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Calendar</h1>
      </div>
      <div className="py-16 text-center border rounded-lg bg-card">
        <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Calendar coming soon</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs mx-auto">
          Google and Apple Calendar sync will be available in an upcoming release.
        </p>
      </div>
    </div>
  );
}
