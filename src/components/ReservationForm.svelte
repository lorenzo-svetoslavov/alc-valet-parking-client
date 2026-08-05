<script>
  import { user } from "@/stores/auth";
  import { supabase } from "@/lib/supabase";
  import { useTranslatedPath, useTranslations } from "@/i18n/utils";
  import { onMount } from "svelte";
  import { z } from "zod";
  import BookingDates from "./BookingDates.svelte";

  export let lang = "es";
  const t = useTranslations(lang);
  const translatePath = useTranslatedPath(lang);

  const API_URL = import.meta.env.PUBLIC_API_URL;

  // --- CONFIGURACIÓN Y CONSTANTES ---

  const TIPO_CLIENTE = {
    PARTICULAR: "particular",
    EMPRESA: "empresa",
  };

  // Franja nocturna con suplemento: de 23:00 a 05:59 (en minutos desde las 00:00)
  const NOCTURNIDAD_INICIO = 23 * 60;
  const NOCTURNIDAD_FIN = 6 * 60;

  // --- SCHEMAS DE VALIDACIÓN (ZOD) ---

  // Schema base para campos comunes
  const getReservationSchema = (isLoggedIn) => {
    const dynamicString = (msg) =>
      isLoggedIn ? z.string().optional() : z.string().min(1, msg);

    const commonShape = {
      clienteId: z.string().optional(),
      // Datos Reserva
      fechaEntrada: z.string().optional(),
      horaEntrada: z.string().optional(),
      fechaSalida: z.string().optional(),
      horaSalida: z.string().optional(),

      tipoPlaza: z.string().min(1, "tipoPlazaRequerido"),
      coche: z.string().min(1, "cocheRequerido"),
      matricula: z.string().min(1, "matriculaRequerida"),
      numVuelo: z.string().optional(),
      comentarios: z.string().optional(),
      precio: z.number(),

      // Datos Cliente Comunes
      nombreCompleto: dynamicString("nombreCompletoRequerido"),
      email: isLoggedIn
        ? z.string().email().optional().or(z.literal("")) // Permite texto vacío ("") porque validar formato email sobre "" da error
        : z.string().min(1, "emailRequerido").email("emailInvalido"),
      telefono: dynamicString("telefonoRequerido"),
      nosConociste: dynamicString("nosConocisteRequerido"),

      // Términos
      aceptaTerminos: z.literal(true, {
        errorMap: () => ({ message: "terminosRequeridos" }),
      }),
    };

    // Esquema para PARTICULAR (Usa los comunes + fija el tipo)
    const ParticularSchema = z.object({
      ...commonShape,
      tipoCliente: z.literal(TIPO_CLIENTE.PARTICULAR),
    });

    // Esquema para EMPRESA (Comunes + OBLIGATORIOS de empresa)
    const EmpresaSchema = z.object({
      ...commonShape,
      tipoCliente: z.literal(TIPO_CLIENTE.EMPRESA),
      // AQUÍ es donde los hacemos obligatorios al mismo nivel que el nombre
      cif: z.string().min(1, "cifRequerido"),
      direccion: z.string().min(1, "direccionRequerida"),
      nombreConductor: z.string().min(1, "conductorRequerido"),
    });

    // Esquema FINAL: Zod elige automáticamente cuál usar según el "tipoCliente"
    return z.discriminatedUnion("tipoCliente", [
      ParticularSchema,
      EmpresaSchema,
    ]);
  };

  // --- ESTADO REACTIVO ---

  let formData = {
    clienteId: "",
    // Reserva
    fechaEntrada: "",
    horaEntrada: "",
    fechaSalida: "",
    horaSalida: "",
    tipoPlaza: "",
    coche: "",
    matricula: "",
    numVuelo: "",
    comentarios: "",
    // Cliente
    tipoCliente: TIPO_CLIENTE.PARTICULAR,
    nombreCompleto: "",
    email: "",
    telefono: "",
    nosConociste: "",
    // Empresa
    cif: "",
    direccion: "",
    nombreConductor: "",
    // Legal
    aceptaTerminos: false,
  };

  let formErrors = {};

  // Vehículos del usuario logueado
  let vehicles = [];
  let selectedVehicleId = ""; // "" => escribir a mano
  let loadedVehiclesFor = null; // id del usuario cuya lista ya cargamos

  // Muestra el selector solo si el usuario está logueado y tiene vehículos.
  $: hasVehicles = !!$user && vehicles.length > 0;

  // Los inputs manuales aparecen cuando:
  //  - no hay selector (no logueado, o logueado sin vehículos), o
  //  - el usuario elige explícitamente "Escribir otro vehículo".
  $: showManualVehicle = !hasVehicles || selectedVehicleId === "__manual__";

  // Estados de UI
  let isSubmitting = false;
  let submitSuccess = false;
  let submitError = "";
  // Estados de Precio
  let calculatedPrice = 0;

  // Esto inyecta automáticamente el precio calculado dentro de formData
  $: formData.precio = calculatedPrice;

  $: if ($user) {
    formData.clienteId = $user.id || null;
  }

  // Carga los vehículos del usuario en cuanto hay sesión (una sola vez por id)
  $: if ($user?.id && loadedVehiclesFor !== $user.id) {
    loadUserVehicles($user.id);
  }

  async function loadUserVehicles(userId) {
    loadedVehiclesFor = userId;
    const { data, error } = await supabase
      .from("vehiculos")
      .select("*")
      .eq("cliente_id", userId);

    if (error) {
      console.error("Error cargando vehículos:", error);
      return;
    }
    vehicles = data || [];
  }

  function clearVehicleFields() {
    formData.coche = "";
    formData.matricula = "";
    formErrors.coche = "";
    formErrors.matricula = "";
    formErrors = { ...formErrors };
  }

  function onSelectVehicle() {
    const v = vehicles.find((x) => String(x.id) === String(selectedVehicleId));
    if (v) {
      // Rellenar con los datos del vehículo elegido y validar
      formData.coche = v.coche;
      formData.matricula = v.matricula;
      validateField("coche");
      validateField("matricula");
    } else {
      // Placeholder ("") o "Escribir otro" (__manual__): vaciar y limpiar errores
      clearVehicleFields();
    }
  }

  // Al volver de la pestaña del perfil, refrescamos la lista de vehículos
  function handleVisibility() {
    if (document.visibilityState === "visible" && $user?.id) {
      loadUserVehicles($user.id);
    }
  }

  onMount(() => {
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  });

  // --- AVISO DE NOCTURNIDAD ---

  function esHoraNocturna(hora) {
    if (!hora) return false;

    const [h, m] = hora.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;

    const minutos = h * 60 + m;
    return minutos >= NOCTURNIDAD_INICIO || minutos < NOCTURNIDAD_FIN;
  }

  // Guarda las horas nocturnas ya avisadas para no repetir el alert
  let avisoNocturnidadMostrado = "";

  // Solo cambia cuando alguna de las dos horas entra/sale de la franja nocturna
  $: nocturnidadSignature = [
    esHoraNocturna(formData.horaEntrada) ? formData.horaEntrada : "",
    esHoraNocturna(formData.horaSalida) ? formData.horaSalida : "",
  ].join("|");

  $: avisarNocturnidad(nocturnidadSignature);

  function avisarNocturnidad(signature) {
    if (typeof window === "undefined") return;

    // Ninguna hora nocturna: reseteamos para volver a avisar si vuelve a serlo
    if (signature === "|") {
      avisoNocturnidadMostrado = "";
      return;
    }

    if (signature === avisoNocturnidadMostrado) return;

    avisoNocturnidadMostrado = signature;
    alert(t("reservar.alert.nocturnidad"));
  }

  // JSON.stringify crea un string simple. Si cambias el nombre o coche,
  // formData cambia, PERO este string resultante sigue siendo idéntico.
  $: pricingSignature = JSON.stringify({
    fechaEntrada: formData.fechaEntrada,
    fechaSalida: formData.fechaSalida,
    tipoPlaza: formData.tipoPlaza,
  });

  // Svelte compara 'pricingSignature' con su valor anterior. Si es igual se DETIENE
  $: loadPrice(pricingSignature);

  async function loadPrice(signature) {
    const params = JSON.parse(signature); // Recuperamos los datos limpios

    // Validación temprana (Guard Clause)
    if (!params.fechaEntrada || !params.fechaSalida || !params.tipoPlaza) {
      calculatedPrice = 0;
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/bookings/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaEntrada: params.fechaEntrada,
          fechaSalida: params.fechaSalida,
          tipoPlaza: params.tipoPlaza,
        }),
      });

      const result = await response.json();

      if (result.success) {
        calculatedPrice = result.data.totalPrice;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function validateField(field) {
    try {
      const currentSchema = getReservationSchema(!!formData.clienteId);

      currentSchema.parse(formData);
      formErrors[field] = "";
      formErrors = { ...formErrors };
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Buscamos si hay un error ESPECÍFICO para el campo que estamos tocando
        const fieldError = err.errors.find((e) => e.path[0] === field);

        // Actualizamos solo ese error
        formErrors[field] = fieldError
          ? t(`reservar.error.${fieldError.message}`)
          : "";

        // Forzamos reactividad de Svelte
        formErrors = { ...formErrors };
      }
    }
  }

  function validateForm() {
    try {
      const currentSchema = getReservationSchema(!!formData.clienteId);

      currentSchema.parse(formData);
      formErrors = {};
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors = {};
        err.errors.forEach((e) => {
          if (typeof e.path[0] === "string") {
            newErrors[e.path[0]] = t(`reservar.error.${e.message}`);
          }
        });
        formErrors = newErrors;
      }
      return false;
    }
  }

  function handleInput(e) {
    const field = e.target.id || e.target.name; // Usamos el ID del input para saber qué campo es
    validateField(field);
  }

  async function handleSubmit() {
    submitError = "";
    submitSuccess = false;

    if (!validateForm()) return;

    isSubmitting = true;

    const cleanPayload = (data) => {
      return Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== "" && v !== null),
      );
    };

    const payload = cleanPayload(formData);

    try {
      const response = await fetch(`${API_URL}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        submitSuccess = true;
        // Scroll al mensaje de éxito
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Opcional: Redirigir a pagina de gracias
      } else {
        submitError = result.message || t("reservar.error.errorEnvio");
      }
    } catch (err) {
      console.error("Error del formulario: ", err);
      submitError = t("reservar.error.errorConexion");
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div
  class="bg-primary d-flex justify-content-center py-4 border-top border-light"
>
  <h2 class="m-0 text-light">{t("reservar.title")}</h2>
</div>

<div class="container my-5">
  {#if submitSuccess}
    <div class="alert alert-success text-center p-5">
      <h3 class="fs-2">{t("reservar.success.title")}</h3>
      <p>{t("reservar.success.description")}</p>
      <button
        class="btn btn-primary mt-3"
        on:click={() => window.location.reload()}
        >{t("reservar.success.button")}</button
      >
    </div>
  {:else}
    <form on:submit|preventDefault={handleSubmit} novalidate>
      {#if !$user}
        <div class="border-2 border-primary p-4 mb-4 rounded bg-light-subtle">
          <h2 class="fs-4 mb-3 text-center">
            {t("reservar.title.calltoaction")}
          </h2>
          <div class="text-center">
            <a
              href={translatePath("/login")}
              class="btn btn-outline-primary me-2">{t("reservar.login")}</a
            >
            <a
              href={translatePath("/registro")}
              class="btn btn-primary text-light">{t("reservar.register")}</a
            >
          </div>
        </div>
      {/if}

      <div class="border-2 border-primary p-4 rounded mb-4">
        <h2 class="fs-3 mb-4 text-primary border-bottom pb-2">
          {t("reservar.subtitle")}
        </h2>

        <div class="row g-3">
          <BookingDates
            {lang}
            bind:fechaEntrada={formData.fechaEntrada}
            bind:horaEntrada={formData.horaEntrada}
            bind:fechaSalida={formData.fechaSalida}
            bind:horaSalida={formData.horaSalida}
          />

          <div class="col-12 col-md-6">
            <label for="square type" class="form-label font-bold"
              >{t("reservar.label.tipoPlaza")}<span class="text-danger">*</span
              ></label
            >
            <select
              id="tipoPlaza"
              class="form-select"
              bind:value={formData.tipoPlaza}
              class:is-invalid={formErrors.tipoPlaza}
              on:change={handleInput}
              on:blur={handleInput}
            >
              <option value="">{t("reservar.seleccionar")}</option>
              <option value="Plaza Cubierta"
                >{t("reservar.option.plazaCubierta")}</option
              >
              <option value="Plaza Aire Libre"
                >{t("reservar.option.plazaAireLibre")}</option
              >
            </select>
            {#if formErrors.tipoPlaza}<div class="invalid-feedback">
                {formErrors.tipoPlaza}
              </div>{/if}
          </div>

          {#if hasVehicles}
            <div class="col-12 col-md-6">
              <label for="miVehiculo" class="form-label font-bold"
                >{t("reservar.label.miVehiculo")}<span class="text-danger"
                  >*</span
                ></label
              >
              <select
                id="miVehiculo"
                class="form-select"
                bind:value={selectedVehicleId}
                on:change={onSelectVehicle}
              >
                <option value=""
                  >{t("reservar.vehicle.selectPlaceholder")}</option
                >
                {#each vehicles as v (v.id)}
                  <option value={v.id}>{v.coche} — {v.matricula}</option>
                {/each}
                <option value="__manual__"
                  >{t("reservar.vehicle.writeOther")}</option
                >
              </select>

              <div class="mt-2">
                <small class="text-muted">
                  {t("reservar.vehicle.notListed")}
                  <a
                    href={translatePath("/perfil")}
                    target="_blank"
                    rel="noopener">{t("reservar.vehicle.addToProfile")}</a
                  >
                </small>
              </div>
            </div>
          {/if}

          {#if showManualVehicle}
            {#if $user && !hasVehicles}
              <div class="col-12">
                <div class="alert alert-light border small mb-0 py-2">
                  {t("reservar.vehicle.saveHint")}
                </div>
              </div>
            {/if}

            <div class="col-12 col-md-6">
              <label for="car" class="form-label font-bold"
                >{t("reservar.label.coche")}<span class="text-danger">*</span
                ></label
              >
              <input
                id="coche"
                type="text"
                class="form-control"
                bind:value={formData.coche}
                class:is-invalid={formErrors.coche}
                placeholder={t("reservar.placeholder.coche")}
                on:input={handleInput}
                on:blur={handleInput}
              />
              {#if formErrors.coche}<div class="invalid-feedback">
                  {formErrors.coche}
                </div>{/if}
            </div>

            <div class="col-12 col-md-6">
              <label for="license plate" class="form-label font-bold"
                >{t("reservar.label.matricula")}<span class="text-danger"
                  >*</span
                ></label
              >
              <input
                id="matricula"
                type="text"
                class="form-control"
                bind:value={formData.matricula}
                class:is-invalid={formErrors.matricula}
                placeholder={t("reservar.placeholder.matricula")}
                on:input={handleInput}
                on:blur={handleInput}
              />
              {#if formErrors.matricula}<div class="invalid-feedback">
                  {formErrors.matricula}
                </div>{/if}
            </div>
          {/if}

          <div class="col-12 col-md-6">
            <label for="num flight" class="form-label font-bold"
              >{t("reservar.label.numVuelo")}</label
            >
            <input
              type="text"
              class="form-control"
              bind:value={formData.numVuelo}
              placeholder={t("reservar.placeholder.numVuelo")}
            />
          </div>
          <div class="col-12 col-md-6">
            <label for="comments" class="form-label font-bold"
              >{t("reservar.label.comentarios")}</label
            >
            <textarea
              class="form-control"
              rows="2"
              bind:value={formData.comentarios}
              placeholder={t("reservar.placeholder.comentarios")}
            ></textarea>
          </div>
        </div>
      </div>

      <div class="card border-primary mb-4 shadow-sm">
        <div class="card-body text-center">
          <h3 class="card-title text-muted fs-5">{t("reservar.fee")}</h3>
          <div class="display-4 fw-bold text-primary my-2">
            {calculatedPrice} €
          </div>
          {#if !calculatedPrice}
            <small class="text-muted">{t("reservar.legend.fee")}</small>
          {/if}
        </div>
      </div>

      {#if !$user}
        <div class="border-2 border-primary p-4 rounded mb-4">
          <h2 class="fs-3 mb-4 text-primary border-bottom pb-2">
            {t("reservar.title.userInfo")}
          </h2>

          <div class="d-flex justify-content-center mb-4">
            <div class="btn-group" role="group">
              <input
                type="radio"
                class="btn-check"
                name="tipoCliente"
                id="t-particular"
                autocomplete="off"
                value={TIPO_CLIENTE.PARTICULAR}
                bind:group={formData.tipoCliente}
              />
              <label class="btn btn-outline-primary px-4" for="t-particular"
                >{t("reservar.particular")}</label
              >

              <input
                type="radio"
                class="btn-check"
                name="tipoCliente"
                id="t-empresa"
                autocomplete="off"
                value={TIPO_CLIENTE.EMPRESA}
                bind:group={formData.tipoCliente}
              />
              <label class="btn btn-outline-primary px-4" for="t-empresa"
                >{t("reservar.company")}</label
              >
            </div>
          </div>

          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label for="name" class="form-label font-bold"
                >{formData.tipoCliente === TIPO_CLIENTE.PARTICULAR
                  ? t("reservar.label.nombreCompleto")
                  : t("reservar.label.razonSocial")}<span class="text-danger"
                  >*</span
                ></label
              >
              <input
                id="nombreCompleto"
                type="text"
                class="form-control"
                placeholder={formData.tipoCliente === TIPO_CLIENTE.PARTICULAR
                  ? t("reservar.placeholder.nombreCompleto")
                  : t("reservar.placeholder.razonSocial")}
                bind:value={formData.nombreCompleto}
                class:is-invalid={formErrors.nombreCompleto}
                on:input={handleInput}
                on:blur={handleInput}
              />
              {#if formErrors.nombreCompleto}<div class="invalid-feedback">
                  {formErrors.nombreCompleto}
                </div>{/if}
            </div>
            <div class="col-12 col-md-6">
              <label for="phone" class="form-label font-bold"
                >{t("reservar.label.telefono")}<span class="text-danger">*</span
                ></label
              >
              <input
                id="telefono"
                type="tel"
                class="form-control"
                placeholder={t("reservar.placeholder.telefono")}
                bind:value={formData.telefono}
                class:is-invalid={formErrors.telefono}
                on:input={handleInput}
                on:blur={handleInput}
              />
              {#if formErrors.telefono}<div class="invalid-feedback">
                  {formErrors.telefono}
                </div>{/if}
            </div>
            <div class="col-12 col-md-6">
              <label for="email" class="form-label font-bold"
                >{t("reservar.label.email")}<span class="text-danger">*</span
                ></label
              >
              <input
                id="email"
                type="email"
                class="form-control"
                placeholder={t("reservar.placeholder.email")}
                bind:value={formData.email}
                class:is-invalid={formErrors.email}
                on:input={handleInput}
                on:blur={handleInput}
              />
              {#if formErrors.email}<div class="invalid-feedback">
                  {formErrors.email}
                </div>{/if}
            </div>
            <div class="col-12 col-md-6">
              <label for="how found" class="form-label font-bold"
                >{t("reservar.label.nosConociste")}<span class="text-danger"
                  >*</span
                ></label
              >
              <select
                id="nosConociste"
                class="form-select"
                bind:value={formData.nosConociste}
                class:is-invalid={formErrors.nosConociste}
                on:input={handleInput}
                on:blur={handleInput}
              >
                <option value="" disabled>{t("reservar.seleccionar")}</option>
                <option value="Ya soy cliente"
                  >{t("nosConociste.yaSoyCliente")}</option
                >
                <option value="Contrato Anual">{t("nosConociste.contratoAnual")}</option>
                <option value="Google">Google</option>
                <option value="Un amigo">{t("nosConociste.unAmigo")}</option>
                <option value="Internet">Internet</option>
              </select>
              {#if formErrors.nosConociste}<div class="invalid-feedback">
                  {formErrors.nosConociste}
                </div>{/if}
            </div>

            {#if formData.tipoCliente === TIPO_CLIENTE.EMPRESA}
              <div class="col-12 mt-4">
                <h5 class="text-secondary">{t("reservar.company.title")}</h5>
              </div>

              <div class="col-12 col-md-6">
                <label for="cif" class="form-label font-bold"
                  >{t("reservar.label.cif")}<span class="text-danger">*</span
                  ></label
                >
                <input
                  id="cif"
                  name="cif"
                  type="text"
                  class="form-control"
                  placeholder={t("reservar.placeholder.cif")}
                  bind:value={formData.cif}
                  class:is-invalid={formErrors.cif}
                  on:input={handleInput}
                  on:blur={handleInput}
                />
                {#if formErrors.cif}<div class="invalid-feedback">
                    {formErrors.cif}
                  </div>{/if}
              </div>
              <div class="col-12 col-md-6">
                <label for="driver name" class="form-label font-bold"
                  >{t("reservar.label.nombreConductor")}<span
                    class="text-danger">*</span
                  ></label
                >
                <input
                  id="nombreConductor"
                  type="text"
                  class="form-control"
                  placeholder={t("reservar.placeholder.nombreConductor")}
                  bind:value={formData.nombreConductor}
                  class:is-invalid={formErrors.nombreConductor}
                  on:input={handleInput}
                  on:blur={handleInput}
                />
                {#if formErrors.nombreConductor}<div class="invalid-feedback">
                    {formErrors.nombreConductor}
                  </div>{/if}
              </div>
              <div class="col-12 col-md-6">
                <label for="address" class="form-label font-bold"
                  >{t("reservar.label.direccion")}<span class="text-danger"
                    >*</span
                  ></label
                >
                <input
                  id="direccion"
                  type="text"
                  class="form-control"
                  placeholder={t("reservar.placeholder.direccion")}
                  bind:value={formData.direccion}
                  class:is-invalid={formErrors.direccion}
                  on:input={handleInput}
                  on:blur={handleInput}
                />
                {#if formErrors.direccion}<div class="invalid-feedback">
                    {formErrors.direccion}
                  </div>{/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="mb-4">
        <div class="form-check">
          <input
            id="aceptaTerminos"
            name="aceptaTerminos"
            class="form-check-input"
            type="checkbox"
            bind:checked={formData.aceptaTerminos}
            class:is-invalid={formErrors.aceptaTerminos}
            on:change={() => validateField("aceptaTerminos")}
          />
          <label class="form-check-label" for="terminos">
            {t("reservar.politicas.1")}
            <a href={translatePath("/politica-cookies")} target="_blank"
              >{t("reservar.politicas.2")}</a
            >
            {t("reservar.politicas.3")}
            <a href={translatePath("/politica-privacidad")} target="_blank"
              >{t("reservar.politicas.4")}</a
            > <span class="text-danger">*</span>
          </label>
          {#if formErrors.aceptaTerminos}
            <div class="invalid-feedback d-block">
              {formErrors.aceptaTerminos}
            </div>
          {/if}
        </div>
      </div>

      {#if submitError}
        <div class="alert alert-danger">{submitError}</div>
      {/if}

      <button
        type="submit"
        class="btn btn-primary w-100 py-3 fs-5 fw-bold"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <span class="spinner-border spinner-border-sm me-2"></span>
          {t("reservas.botones.enviando")}
        {:else}
          {t("reservar.boton.confirmarReserva")}
        {/if}
      </button>
    </form>
  {/if}
</div>
