import AppHeader from "./AppHeader";

interface Props {
  title: string;
}

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white">
      <AppHeader variant="wide" />
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="font-bold text-ink text-[20px]">{title}</h1>
        <p className="mt-2 text-[14px] text-caption">준비 중이에요. 곧 채워질 예정입니다.</p>
      </div>
    </div>
  );
}
