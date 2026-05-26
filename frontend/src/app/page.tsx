"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navbar */}
      <nav className="border-b border-gray-200 bg-white/95 backdrop-blur-md fixed w-full top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-md">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">AEROFINDER</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-gray-700 hover:text-gray-900 font-medium transition">
              Ingresar
            </Link>
            <Link href="/register" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
              Crear Cuenta
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="pt-32 pb-20 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Búsqueda Inteligente con Drones e IA
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Aerofinder utiliza inteligencia artificial avanzada y drones para detectar y localizar personas desaparecidas en tiempo real, mejorando significativamente las operaciones de búsqueda y rescate.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-lg">
              Reportar Caso
            </Link>
            <Link href="/login" className="border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-lg hover:bg-blue-50 transition font-semibold text-lg">
              Ingresar al Sistema
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white py-16 px-4">
        <div className="mx-auto max-w-6xl grid md:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">98%</div>
            <div className="text-gray-600">Precisión de Detección</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">&lt;2s</div>
            <div className="text-gray-600">Latencia de Procesamiento</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">24/7</div>
            <div className="text-gray-600">Monitoreo en Tiempo Real</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">GPU</div>
            <div className="text-gray-600">Aceleración de Hardware</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-12">Características Principales</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Detección Inteligente",
                description: "IA avanzada que detecta personas en cualquier entorno",
                icon: "🤖"
              },
              {
                title: "Drones Autónomos",
                description: "Compatible con cualquier dron RTMP (DJI, Autel, Skydio y otros)",
                icon: "🚁"
              },
              {
                title: "Reconocimiento Facial",
                description: "Identificación precisa mediante FaceNet",
                icon: "👤"
              },
              {
                title: "Alertas Automáticas",
                description: "Notificaciones instantáneas de detecciones",
                icon: "🔔"
              },
              {
                title: "Datos en Tiempo Real",
                description: "Visualización de video HLS con lat. <2s",
                icon: "📊"
              },
              {
                title: "Seguridad RBAC",
                description: "Control de acceso basado en roles",
                icon: "🔐"
              }
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cómo funciona */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-12">Cómo Funciona</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: 1, title: "Reportar", desc: "Familia reporta persona desaparecida" },
              { step: 2, title: "Revisar", desc: "Admin valida y aprueba el caso" },
              { step: 3, title: "Buscar", desc: "Drone inicia búsqueda con IA" },
              { step: 4, title: "Encontrar", desc: "Detecciones automáticas en tiempo real" }
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-white text-blue-600 font-bold text-xl mb-4">
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-blue-100">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Final */}
      <div className="py-16 px-4 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">¿Necesitas Reportar Persona Desaparecida?</h2>
          <p className="text-lg text-gray-600 mb-8">
            Crea una cuenta ahora y reporta el caso. Nuestro equipo de buscadores e IA se activarán inmediatamente después de la aprobación.
          </p>
          <Link href="/register" className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition font-semibold text-lg">
            Reportar Ahora
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12 px-4">
        <div className="mx-auto max-w-6xl grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.5 1.5H5.75A4.25 4.25 0 001.5 5.75v8.5A4.25 4.25 0 005.75 18.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0014.25 1.5h-3.75" />
              </svg>
              <span className="font-bold">AEROFINDER</span>
            </div>
            <p className="text-sm">Sistema inteligente de búsqueda y rescate basado en IA y drones.</p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Acceso Rápido</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/register" className="hover:text-blue-400 transition">Crear Cuenta</Link></li>
              <li><Link href="/login" className="hover:text-blue-400 transition">Ingresar</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Información</h4>
            <p className="text-sm">© 2026 AEROFINDER. Sistema de Grado. Todos los derechos reservados.</p>
          </div>
        </div>
        <div className="border-t border-gray-700 pt-8 text-center text-sm text-gray-400">
          <p>Uso exclusivo de personal autorizado • Confidencial</p>
        </div>
      </footer>
    </div>
  );
}
