<script>
  import { onMount } from "svelte";
  import flatpickr from "flatpickr";
  import { Spanish } from "flatpickr/dist/l10n/es.js";
  import "flatpickr/dist/themes/airbnb.css";
  import { useTranslations } from "@/i18n/utils";
  import FlightLand from "@/assets/icons/FlightLand.svelte";
  import FlightTakeoff from "@/assets/icons/FlightTakeoff.svelte";

  // Props para recibir datos y devolverlos al padre (Two-way binding)
  export let lang = "es";
  export let fechaEntrada = "";
  export let horaEntrada = "";
  export let fechaSalida = "";
  export let horaSalida = "";
  export let fechasBloqueadas = [
    function (date) {
      if (date.getMonth() === 0 && date.getDate() === 1) {
        return true; // true = bloqueado
      }

      if (date.getMonth() === 11 && date.getDate() === 25) {
        return true; // true = bloqueado
      }

      return false; // false = permitido
    },
  ];

  // Errores de validación que llegan del formulario padre
  export let errors = { horaEntrada: "", horaSalida: "" };

  const t = useTranslations(lang);

  // Horario de festivo: 24 y 31 de diciembre cerramos a las 14:00 (incluida)
  const HORA_MAX_FESTIVO = "14:00";
  const HORA_MAX_NORMAL = "23:55";

  // Comprueba si una fecha es 24 o 31 de diciembre (cualquier año)
  function esCierreFestivo(fechaStr) {
    if (!fechaStr) return false;
    // Parseamos como fecha local (YYYY-MM-DDT00:00:00) para evitar desfase UTC
    const date = new Date(`${fechaStr}T00:00:00`);
    return date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 31);
  }

  // REFERENCIAS AL HTML (Para que Flatpickr sepa dónde pintarse)
  let refInputFechaEntrada;
  let refInputHoraEntrada;
  let refInputFechaSalida;
  let refInputHoraSalida;

  // Referencias a los selectores de hora (para cambiarles el maxTime)
  let fpHoraEntrada;
  let fpHoraSalida;

  // Actualiza el maxTime del selector de hora según la fecha elegida
  function actualizarMaxTimeHora(fpHora, fechaStr, horaActual, setHora) {
    if (!fpHora) return;
    const maxTime = esCierreFestivo(fechaStr) ? HORA_MAX_FESTIVO : HORA_MAX_NORMAL;
    fpHora.set("maxTime", maxTime);

    // Si la hora seleccionada supera el nuevo máximo, la limpiamos
    if (fechaStr && horaActual && horaActual > maxTime) {
      fpHora.clear();
      setHora("");
    }
  }

  // Texto de ayuda dinámico (06:00 - 14:00 en fechas de cierre festivo)
  $: maxHoraEntrada = esCierreFestivo(fechaEntrada) ? HORA_MAX_FESTIVO : HORA_MAX_NORMAL;
  $: maxHoraSalida = esCierreFestivo(fechaSalida) ? HORA_MAX_FESTIVO : HORA_MAX_NORMAL;

  onMount(() => {
    // CALCULAR LA FECHA MÍNIMA DE ENTRADA
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1); // Sumamos 1 día a hoy

    const configBase = {
      locale: Spanish,
      altInput: true,
      altFormat: "d-m-Y", // Lo que ve el usuario
      dateFormat: "Y-m-d", // Lo que le llega al servidor
      disableMobile: true,
      disable: fechasBloqueadas,
    };

    // === CONFIGURACIÓN FECHAS ===
    // Usamos 'refInputFechaEntrada' para vincularlo al HTML
    const fpEntrada = flatpickr(refInputFechaEntrada, {
      ...configBase,
      minDate: manana,
      onChange: (selectedDates, dateStr) => {
        fechaEntrada = dateStr; // Actualizamos la variable para Svelte

        // Límite de hora en 24/31 de diciembre (cierre festivo a las 14:00)
        actualizarMaxTimeHora(fpHoraEntrada, dateStr, horaEntrada, (v) => (horaEntrada = v));

        // Actualizamos el mínimo de la salida
        fpSalida.set("minDate", dateStr);
        // Si la salida es menor a la nueva entrada, limpiamos salida
        if (fechaSalida && fpSalida.selectedDates[0] < selectedDates[0]) {
          fpSalida.clear();
          fechaSalida = "";
        }
      },
    });

    const fpSalida = flatpickr(refInputFechaSalida, {
      ...configBase,
      minDate: manana,
      onChange: (_, dateStr) => {
        fechaSalida = dateStr; // Actualizamos variable

        // Límite de hora en 24/31 de diciembre (cierre festivo a las 14:00)
        actualizarMaxTimeHora(fpHoraSalida, dateStr, horaSalida, (v) => (horaSalida = v));
      },
    });

    // === CONFIGURACIÓN HORAS ===
    const configHora = {
      disableMobile: true,
      enableTime: true,
      noCalendar: true, // Solo reloj
      dateFormat: "H:i",
      time_24hr: true, // Formato 24 horas
      locale: Spanish,
      minTime: "06:00",
      maxTime: "23:55",
      minuteIncrement: 5,
    };

    // Función para redondear minutos
    const corregirMinutos = (selectedDates, dateStr, instance) => {
      if (selectedDates.length > 0) {
        const date = selectedDates[0];
        const minutes = date.getMinutes();
        const remainder = minutes % 5;

        // Si los minutos no son múltiplo de 5 (ej: 4, 13, 22)
        if (remainder !== 0) {
          // Redondeamos al 5 más cercano
          const roundedMinutes = Math.round(minutes / 5) * 5;
          date.setMinutes(roundedMinutes);

          // Actualizamos el valor en Flatpickr (el 'true' dispara el onChange)
          instance.setDate(date, true);
        }
      }
    };

    fpHoraEntrada = flatpickr(refInputHoraEntrada, {
      ...configHora,
      onChange: (_, timeStr) => (horaEntrada = timeStr),
      onClose: corregirMinutos,
    });

    fpHoraSalida = flatpickr(refInputHoraSalida, {
      ...configHora,
      onChange: (_, timeStr) => (horaSalida = timeStr),
      onClose: corregirMinutos,
    });
  });
</script>

<div class="flex flex-col gap-4">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label
        for="fecha entrada"
        class="d-flex gap-1 text-gray-700 font-bold"
      >
        <FlightTakeoff />
        {t("reservar.label.fechaEntrada")}
      </label>
      <input
        bind:this={refInputFechaEntrada}
        class="w-full p-2 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
        placeholder="dd-mm-aaaa"
      />
    </div>

    <div>
      <label
        for="hora entrada"
        class="d-flex gap-1 text-gray-700 font-bold"
      >
        <FlightTakeoff />
        {t("reservar.label.horaEntrada")}
      </label>
      <input
        bind:this={refInputHoraEntrada}
        class="w-full p-2 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
        class:is-invalid={errors.horaEntrada}
        placeholder="--:--"
      />
      {#if errors.horaEntrada}
        <div class="invalid-feedback">{errors.horaEntrada}</div>
      {/if}
      <p class="text-xs text-gray-500 mt-1 flex items-center mb-0">
        {t("reservar.textHelp.horaEntrada")}: 06:00 - {maxHoraEntrada}
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label
        for="fecha salida"
        class="d-flex gap-1 text-gray-700 font-bold"
      >
        <FlightLand class="w-4 h-4" />
        {t("reservar.label.fechaSalida")}
      </label>
      <input
        bind:this={refInputFechaSalida}
        class="w-full p-2 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
        placeholder="dd-mm-aaaa"
      />
    </div>

    <div>
      <label
        for="hora salida"
        class="d-flex gap-1 text-gray-700 font-bold"
      >
        <FlightLand class="w-4 h-4" />
        {t("reservar.label.horaSalida")}
      </label>
      <input
        bind:this={refInputHoraSalida}
        class="w-full p-2 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
        class:is-invalid={errors.horaSalida}
        placeholder="--:--"
      />
      {#if errors.horaSalida}
        <div class="invalid-feedback">{errors.horaSalida}</div>
      {/if}
      <p class="text-xs text-gray-500 mt-1 flex items-center mb-0">
        {t("reservar.textHelp.horaEntrada")}: 06:00 - {maxHoraSalida}
      </p>
    </div>
  </div>
</div>
