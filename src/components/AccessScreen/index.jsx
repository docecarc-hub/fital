import {signOut} from 'firebase/auth'

import {auth} from '../../firebase'
import logoImg from '../../assets/logo-car-doce-car.png'

import '../Login/index.css'

const COPY = {
  'no-profile': {
    title: 'Acesso não configurado',
    text: 'Seu login ainda não tem um cargo. Peça ao Administrativo da sua unidade para cadastrar você.',
  },
  inactive: {
    title: 'Acesso desativado',
    text: 'Seu login foi desativado. Fale com o Administrativo da sua unidade.',
  },
  error: {
    title: 'Não foi possível verificar seu acesso',
    text: 'Confira a conexão com a internet e tente novamente.',
  },
}

const AccessScreen = ({variant, uid}) => {
  const {title, text} = COPY[variant] || COPY.error

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logoImg} alt="Car Doce Car Auto Service" className="login-logo" />
        <h1 className="login-title">{title}</h1>
        <p className="login-subtitle">{text}</p>

        {variant === 'no-profile' && uid && (
          <p className="login-subtitle">
            Primeiro administrador? Use este código no Firestore (veja o README):
            <br />
            <code style={{wordBreak: 'break-all', userSelect: 'all'}}>{uid}</code>
          </p>
        )}

        <button type="button" className="login-button" onClick={() => signOut(auth)}>
          Sair
        </button>
      </div>
    </div>
  )
}

export default AccessScreen