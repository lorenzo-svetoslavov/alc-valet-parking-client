<script>
    import { useTranslatedPath, useTranslations } from "@/i18n/utils";
    import { user } from "@/stores/auth"; // Importamos el estado global
    import { supabase } from "@/lib/supabase";
    import Logo from "@/assets/logo.png";

    export let lang = "es"; // Valor por defecto
    const t = useTranslations(lang);
    const translatePath = useTranslatedPath(lang);

    // Función para cerrar sesión
    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = translatePath("/"); // Redirigir a home tras salir
    };
</script>

<header class="navbar navbar-expand-lg bg-primary">
    <div class="container-fluid">
        <a class="navbar-brand" href={translatePath("/")}>
            <img
                src={Logo.src}
                alt="Logo"
                style="height: 80px; width: auto;"
                loading="eager"
            />
        </a>
        <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#offcanvasNavbar"
            aria-controls="offcanvasNavbar"
            aria-label="Toggle navigation"
        >
            <span class="navbar-toggler-icon"></span>
        </button>
        <div
            class="offcanvas offcanvas-end bg-primary text-light"
            tabindex="-1"
            id="offcanvasNavbar"
            aria-labelledby="offcanvasNavbarLabel"
        >
            <div class="offcanvas-header bg-primary">
                <h5 class="offcanvas-title" id="offcanvasNavbarLabel">
                    ALC Valet Parking
                </h5>
                <button
                    type="button"
                    class="btn-close btn-close-white"
                    data-bs-dismiss="offcanvas"
                    aria-label="Close"
                ></button>
            </div>
            <div class="offcanvas-body bg-primary">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                        <a
                            href={translatePath("/")}
                            class="nav-link fw-medium text-light"
                            >{t("header.home").toUpperCase()}</a
                        >
                    </li>
                    <li class="nav-item">
                        <a
                            href={translatePath("/la-empresa")}
                            class="nav-link fw-medium text-light"
                            >{t("header.company").toUpperCase()}</a
                        >
                    </li>
                    <li class="nav-item">
                        <a
                            href={translatePath("/como-funciona")}
                            class="nav-link fw-medium text-light"
                            >{t("header.howitworks").toUpperCase()}</a
                        >
                    </li>
                    <li class="nav-item">
                        <a
                            href={translatePath("/reservar")}
                            class="nav-link fw-medium text-light"
                            >{t("header.booking").toUpperCase()}</a
                        >
                    </li>
                    <li class="nav-item">
                        <a
                            href={translatePath("/servicios-adicionales")}
                            class="nav-link fw-medium text-light"
                            >{t("header.extraservices").toUpperCase()}</a
                        >
                    </li>
                    <li class="nav-item">
                        <a
                            href={translatePath("/localizacion")}
                            class="nav-link fw-medium text-light"
                            >{t("header.location").toUpperCase()}</a
                        >
                    </li>
                </ul>
                <div
                    class="d-flex align-items-center justify-content-center ms-lg-4 mt-3 mt-lg-0"
                >
                    {#if $user}
                        <div class="dropdown text-lg-end w-100 w-lg-auto">
                            <button
                                class="btn bg-white text-primary border-0 rounded-pill shadow-sm px-4 py-2 d-flex align-items-center justify-content-center gap-2 w-100 w-lg-auto"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                            >
                                <span class="fw-bold">{t("header.myAccount")}</span>
                            </button>

                            <ul
                                class="dropdown-menu dropdown-menu-end shadow border-0 mt-2 p-2 rounded-3 w-100 w-lg-auto"
                            >
                                <li>
                                    <a
                                        class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2"
                                        href={translatePath("/perfil")}
                                    >
                                        {t("header.myProfile")}
                                    </a>
                                </li>
                                <li>
                                    <button
                                        class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 text-danger"
                                        on:click={handleLogout}
                                    >
                                        {t("header.logout")}
                                    </button>
                                </li>
                            </ul>
                        </div>
                    {:else}
                        <a
                            href={translatePath("/login")}
                            class="btn bg-white text-primary fw-bold rounded-pill px-4 py-2 shadow-sm w-100 w-lg-auto d-flex align-items-center justify-content-center gap-2"
                        >
                            {t("header.login")}
                        </a>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</header>
