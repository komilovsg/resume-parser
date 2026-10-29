import { DemoNav } from "./nav";

export default function NoDict() {
  return (
    <div className="yd">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <DemoNav current="profile" />
        <section className="yd-card mt-6" role="status">
          <h1 className="text-[22px] font-bold leading-tight">Справочники не настроены</h1>
          <p className="mt-2 text-[15px] leading-snug text-muted">
            Страницы анкеты работают со справочниками должностей, навыков и регионов. Укажите их источник в переменной PROFILE_DICT_URL и перезапустите сервер.
          </p>
        </section>
      </div>
    </div>
  );
}
