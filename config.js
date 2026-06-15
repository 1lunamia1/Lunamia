// En localhost mantiene la app en modo demo local.
// En producción usa la clave publishable de Supabase; la seguridad depende de RLS + usuarios autenticados.
{
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  window.LUNAMIA_CONFIG = isLocal ? {} : {
    SUPABASE_URL: "https://sgzofcolsmqjrzyzjchl.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_KGeHXe8FEPVHyFYjYEqWsQ_W89bpBWq",
  };
}
