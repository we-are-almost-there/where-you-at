import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import 'pretendard/dist/web/variable/pretendardvariable.css' // 폰트 로컬 번들 (CDN 의존 제거)
import './index.css'
import App from './App.tsx'

const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
)
