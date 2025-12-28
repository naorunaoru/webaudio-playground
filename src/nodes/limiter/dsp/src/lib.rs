#[repr(C)]
pub struct Limiter {
    ceiling_lin: f32,
    makeup_lin: f32,
    release_coeff: f32,
    bypass: u32,
    stereo_link: u32,
    gain_linked: f32,
    gain_ch0: f32,
    gain_ch1: f32,
    sample_rate_hz: f32,
}

fn clamp(v: f32, min: f32, max: f32) -> f32 {
    if !v.is_finite() {
        return min;
    }
    if v < min {
        min
    } else if v > max {
        max
    } else {
        v
    }
}

fn db_to_lin(db: f32) -> f32 {
    (10.0_f32).powf(db / 20.0)
}

fn release_coeff_for_ms(release_ms: f32, sample_rate_hz: f32) -> f32 {
    let r_ms = clamp(release_ms, 0.1, 5000.0);
    let r_sec = r_ms / 1000.0;
    let n = (r_sec * sample_rate_hz).max(1.0);
    (-1.0 / n).exp()
}

#[no_mangle]
pub extern "C" fn limiter_new(sample_rate_hz: f32) -> *mut Limiter {
    let mut l = Limiter {
        ceiling_lin: db_to_lin(-0.3),
        makeup_lin: 1.0,
        release_coeff: release_coeff_for_ms(120.0, sample_rate_hz),
        bypass: 0,
        stereo_link: 1,
        gain_linked: 1.0,
        gain_ch0: 1.0,
        gain_ch1: 1.0,
        sample_rate_hz,
    };
    l.release_coeff = release_coeff_for_ms(120.0, l.sample_rate_hz);
    Box::into_raw(Box::new(l))
}

#[no_mangle]
pub extern "C" fn limiter_free(ptr: *mut Limiter) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(ptr));
    }
}

#[no_mangle]
pub extern "C" fn limiter_set_params(
    ptr: *mut Limiter,
    ceiling_db: f32,
    release_ms: f32,
    makeup_db: f32,
    bypass: u32,
    stereo_link: u32,
) {
    if ptr.is_null() {
        return;
    }
    let l = unsafe { &mut *ptr };
    l.ceiling_lin = db_to_lin(clamp(ceiling_db, -60.0, 0.0));
    l.makeup_lin = db_to_lin(clamp(makeup_db, -24.0, 24.0));
    l.release_coeff = release_coeff_for_ms(release_ms, l.sample_rate_hz);
    l.bypass = if bypass != 0 { 1 } else { 0 };
    l.stereo_link = if stereo_link != 0 { 1 } else { 0 };
}

#[no_mangle]
pub extern "C" fn limiter_process_interleaved(
    ptr: *mut Limiter,
    in_ptr: *const f32,
    out_ptr: *mut f32,
    frames: usize,
    channels: usize,
) {
    if ptr.is_null() || in_ptr.is_null() || out_ptr.is_null() {
        return;
    }
    let l = unsafe { &mut *ptr };
    let channels = channels.min(2).max(1);
    let n = frames.saturating_mul(channels);
    let input = unsafe { core::slice::from_raw_parts(in_ptr, n) };
    let output = unsafe { core::slice::from_raw_parts_mut(out_ptr, n) };

    if l.bypass != 0 {
        output.copy_from_slice(input);
        return;
    }

    let ceiling = l.ceiling_lin;
    let makeup = l.makeup_lin;
    let rel = l.release_coeff;

    if l.stereo_link != 0 && channels == 2 {
        let mut g = l.gain_linked;
        for i in 0..frames {
            let idx = i * 2;
            let l0 = input[idx] * makeup;
            let r0 = input[idx + 1] * makeup;
            let peak = l0.abs().max(r0.abs());
            let target = if peak > ceiling { ceiling / peak } else { 1.0 };
            g = if target < g { target } else { g * rel + (1.0 - rel) * target };
            output[idx] = l0 * g;
            output[idx + 1] = r0 * g;
        }
        l.gain_linked = g;
        return;
    }

    // per-channel limiting (also covers mono)
    let mut g0 = l.gain_ch0;
    let mut g1 = l.gain_ch1;

    if channels == 1 {
        for i in 0..frames {
            let v = input[i] * makeup;
            let a = v.abs();
            let target = if a > ceiling { ceiling / a } else { 1.0 };
            g0 = if target < g0 { target } else { g0 * rel + (1.0 - rel) * target };
            output[i] = v * g0;
        }
        l.gain_ch0 = g0;
        return;
    }

    for i in 0..frames {
        let idx = i * 2;
        let lv = input[idx] * makeup;
        let rv = input[idx + 1] * makeup;

        let la = lv.abs();
        let ra = rv.abs();

        let lt = if la > ceiling { ceiling / la } else { 1.0 };
        let rt = if ra > ceiling { ceiling / ra } else { 1.0 };

        g0 = if lt < g0 { lt } else { g0 * rel + (1.0 - rel) * lt };
        g1 = if rt < g1 { rt } else { g1 * rel + (1.0 - rel) * rt };

        output[idx] = lv * g0;
        output[idx + 1] = rv * g1;
    }

    l.gain_ch0 = g0;
    l.gain_ch1 = g1;
}

#[no_mangle]
pub extern "C" fn wasm_alloc(bytes: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(bytes);
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn wasm_free(ptr: *mut u8, bytes: usize) {
    if ptr.is_null() || bytes == 0 {
        return;
    }
    unsafe {
        drop(Vec::<u8>::from_raw_parts(ptr, 0, bytes));
    }
}

