import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, query, where, doc, getDoc, addDoc, serverTimestamp, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAzzCc3z1g8-Zh-0WSS2ttOTrExXJuqnFE",
    authDomain: "laundry-webapp-d3e0c.firebaseapp.com",
    projectId: "laundry-webapp-d3e0c",
    storageBucket: "laundry-webapp-d3e0c.firebasestorage.app",
    messagingSenderId: "740474113356",
    appId: "1:740474113356:web:018c7a108da4ebceae13e9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State Global
let userData = null;
let selectedLaundry = null;
let selectedService = null;
let laundriesData = {}; 

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login-customer.html"; return; }
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
            userData = snap.data();
            const initial = userData.name ? userData.name.charAt(0).toUpperCase() : "U";
            
            if(document.getElementById("profileName")) document.getElementById("profileName").innerText = userData.name || "User";
            if(document.getElementById("profilePhone")) document.getElementById("profilePhone").innerText = userData.phone || "";
            if(document.getElementById("userInitialIcon")) document.getElementById("userInitialIcon").innerText = initial;
            if(document.getElementById("userInitialLarge")) document.getElementById("userInitialLarge").innerText = initial;
            
            const displayAddress = document.getElementById("displayAddress");
            const locText = document.getElementById("locText");
            const locStatusBar = document.getElementById("locStatusBar");

            if (userData.custLoc) {
                if(displayAddress) displayAddress.innerText = "Lokasi GPS Aktif ✅";
                if(locText) {
                    locText.innerText = "Titik Jemput Terpasang ✅";
                    locText.style.color = "#16a34a";
                }
                if(locStatusBar) locStatusBar.innerText = "Titik jemput presisi aktif";
            } else {
                if(displayAddress) displayAddress.innerText = "Lokasi Belum Diset";
            }
        }
    });

    syncLaundries();
    syncOrders(user.uid);
});

// --- MANAJEMEN DAFTAR LAUNDRY ---
function syncLaundries() {
    onSnapshot(collection(db, "laundries"), (snap) => {
        const container = document.getElementById("laundryGrid");
        if(!container) return;
        container.innerHTML = "";
        
        snap.forEach(dDoc => {
            const l = dDoc.data();
            const id = dDoc.id;
            laundriesData[id] = { id, ...l }; 

            container.innerHTML += `
                <div class="laundry-card" onclick="handleLaundryClick('${id}')">
                    <div style="height:100px; background:#e0f2fe; display:flex; align-items:center; justify-content:center;">
                        <i data-lucide="store" style="width:40px; color:#0ea5e9;"></i>
                    </div>
                    <div style="padding:12px;">
                        <h4 style="margin:0; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${l.laundryName}</h4>
                        <p style="font-size:11px; color:#64748b; margin:4px 0;">${l.laundryCoords ? "📍 Tersedia" : "❓ Lokasi Belum Set"}</p>
                    </div>
                </div>`;
        });
        if (window.lucide) lucide.createIcons();
    });
}

window.handleLaundryClick = (id) => {
    const laundry = laundriesData[id];
    if (laundry) openServiceModal(laundry);
};

function openServiceModal(laundry) {
    selectedLaundry = laundry;
    selectedService = null; 
    document.getElementById("modalLaundryName").innerText = laundry.laundryName;
    document.getElementById("estWeight").value = 1; // reset ke 1
    
    const opt = document.getElementById("serviceOptions");
    opt.innerHTML = "";
    
    if (laundry.services && laundry.services.length > 0) {
        laundry.services.forEach((s, index) => {
            opt.innerHTML += `
                <div class="service-item" id="svc-${index}" onclick="selectService(${index}, '${s.name}', ${s.price})" style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 8px; cursor: pointer;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:700; font-size:14px;">${s.name}</div>
                            <div style="font-size:12px; color:#0ea5e9;">Rp ${s.price.toLocaleString()}/kg</div>
                        </div>
                    </div>
                </div>`;
        });
    } else {
        opt.innerHTML = "<p style='color:#94a3b8; font-size:12px;'>Laundry ini belum memiliki layanan.</p>";
    }
    updateEstimation(); // Reset label estimasi
    document.getElementById("serviceModal").style.display = "flex";
}

window.selectService = (idx, name, price) => {
    selectedService = { name, price };
    document.querySelectorAll('.service-item').forEach(el => {
        el.style.borderColor = "#e2e8f0";
        el.style.background = "white";
    });
    const el = document.getElementById(`svc-${idx}`);
    el.style.borderColor = "#0ea5e9";
    el.style.background = "#f0f9ff";
    updateEstimation();
};

// --- LOGIKA ESTIMASI BIAYA ---
window.updateEstimation = () => {
    const weight = parseFloat(document.getElementById("estWeight").value) || 0;
    const price = selectedService ? selectedService.price : 0;
    const deliveryFee = 10000; // Biaya Antar-Jemput PP

    const jasaTotal = weight * price;
    const totalSemua = jasaTotal + deliveryFee;

    document.getElementById("labelEstJasa").innerText = `Rp ${jasaTotal.toLocaleString()}`;
    document.getElementById("labelEstTotal").innerText = `Rp ${totalSemua.toLocaleString()}`;
};


// --- MANAJEMEN PESANAN (VERSI UPDATE HARGA FINAL) ---
function syncOrders(uid) {
    const q = query(collection(db, "orders"), where("customerId", "==", uid));
    onSnapshot(q, (snap) => {
        const list = document.getElementById("orderList"); // Pastikan ID ini sesuai di HTML (orderList)
        if(!list) return;
        list.innerHTML = "";
        
        if (snap.empty) {
            list.innerHTML = "<div style='text-align:center; padding:40px; color:#94a3b8;'>Belum ada pesanan.</div>";
            return;
        }

        const sortedDocs = snap.docs.sort((a, b) => {
            const timeA = a.data().createdAt?.toMillis() || Date.now();
            const timeB = b.data().createdAt?.toMillis() || Date.now();
            return timeB - timeA;
        });

        sortedDocs.forEach(dDoc => {
            const d = dDoc.data();
            let color = "#0ea5e9";
            let statusLabel = d.status.toUpperCase();
            
            // LOGIKA HARGA FINAL (TAMBAHAN BARU)
            let hargaTampil = d.estPrice || 0;
            let infoBerat = `${d.estWeight || 0}kg (Estimasi)`;
            let labelTagihan = "Estimasi Tagihan";

            if (d.finalPrice && d.finalPrice > 0) {
                hargaTampil = d.finalPrice;
                infoBerat = `${d.finalWeight}kg (Timbangan Riil)`;
                labelTagihan = "Total Tagihan (FIX)";
            }

            // Status Styling
            if (d.status === "searching") { color = "#f59e0b"; statusLabel = "🛵 MENCARI KURIR"; }
            else if (d.status === "taken") { color = "#0ea5e9"; statusLabel = "🚚 KURIR DI JALAN"; }
            else if (d.status === "collected") { color = "#6366f1"; statusLabel = "🧺 DIBAWA KURIR"; }
            else if (d.status === "at_laundry") { color = "#10b981"; statusLabel = "🧼 SEDANG DICUCI"; }
            else if (d.status === "ready_to_deliver") { color = "#0ea5e9"; statusLabel = "📦 SIAP DIANTAR"; }
            else if (d.status === "completed") { color = "#94a3b8"; statusLabel = "✅ SELESAI"; }

            list.innerHTML += `
                <div class="card-order" style="border-left: 5px solid ${color}; background:white; padding:15px; border-radius:12px; margin-bottom:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <strong style="font-size:14px;">${d.laundryName}</strong>
                            <div style="font-size:12px; color:#64748b; margin-top:4px;">${d.serviceName} • ${infoBerat}</div>
                        </div>
                        <span style="font-size:10px; color:#94a3b8;">${d.createdAt ? d.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Baru'}</span>
                    </div>
                    
                    <div style="background:#f0f9ff; padding:8px 12px; border-radius:8px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:10px; font-weight:600; color:#0369a1;">${labelTagihan}</span>
                        <strong style="color:#0ea5e9; font-size:13px;">Rp ${hargaTampil.toLocaleString()}</strong>
                    </div>

                    <div style="margin-top:10px; font-weight:800; color:${color}; font-size:10px; letter-spacing:0.5px;">${statusLabel}</div>
                </div>`;
        });
    });
}


document.getElementById("btnOrder").onclick = async () => {
    if (!selectedService) return Swal.fire("Pilih Layanan", "Mohon pilih salah satu jenis layanan.", "warning");
    if (!userData.custLoc) return Swal.fire("Lokasi GPS", "Mohon atur titik jemput di menu Profil dahulu.", "error");

    const est = document.getElementById("estWeight").value;
    const jasaTotal = parseFloat(est) * selectedService.price;
    const deliveryFee = 10000;

    try {
        await addDoc(collection(db, "orders"), {
            customerId: auth.currentUser.uid,
            customerName: userData.name,
            customerWA: userData.phone,
            custLoc: userData.custLoc,
            tenantId: selectedLaundry.id,
            laundryName: selectedLaundry.laundryName,
            serviceName: selectedService.name,
            estWeight: parseFloat(est) || 1,
            estPrice: jasaTotal + deliveryFee,
            paymentMethod: "cash",
            status: "searching",
            createdAt: serverTimestamp()
        });
        
        document.getElementById("serviceModal").style.display = "none";
        Swal.fire("Berhasil", "Pesanan terkirim! Kurir akan segera merespon.", "success");
        window.switchPage('orders', document.querySelectorAll('.nav-item')[1]);
    } catch (e) {
        Swal.fire("Error", "Gagal membuat pesanan: " + e.message, "error");
    }
};

// --- FITUR PROFIL & LOKASI ---
window.updateUserLocation = () => {
    if (!navigator.geolocation) return Swal.fire("GPS", "Browser Anda tidak mendukung fitur lokasi.", "error");

    Swal.fire({
        title: 'Update Titik Jemput',
        text: "Gunakan posisi GPS Anda saat ini sebagai titik jemput?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Update'
    }).then((res) => {
        if (res.isConfirmed) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                await updateDoc(doc(db, "users", auth.currentUser.uid), {
                    custLoc: { lat: pos.coords.latitude, lng: pos.coords.longitude }
                });
                Swal.fire("Sukses", "Titik jemput berhasil diperbarui secara presisi.", "success");
            }, (err) => {
                Swal.fire("Gagal", "Akses lokasi ditolak. Pastikan GPS aktif.", "error");
            });
        }
    });
};

window.editProfile = async () => {
    const { value: form } = await Swal.fire({
        title: 'Edit Profil',
        html:
            `<input id="sw-name" class="swal2-input" placeholder="Nama Lengkap" value="${userData.name || ''}">` +
            `<input id="sw-phone" class="swal2-input" placeholder="No. WhatsApp" value="${userData.phone || ''}">`,
        preConfirm: () => ({
            name: document.getElementById('sw-name').value,
            phone: document.getElementById('sw-phone').value
        })
    });

    if (form) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), form);
        Swal.fire("Selesai", "Data profil telah diperbarui.", "success");
    }
};

window.logout = async () => {
    const res = await Swal.fire({ 
        title: 'Keluar Akun?', 
        text: "Anda perlu masuk kembali untuk memesan laundry.",
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: '#ef4444'
    });
    if(res.isConfirmed) {
        await signOut(auth);
        window.location.href="login-customer.html";
    }
};
