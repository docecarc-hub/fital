// Cargos do sistema e o que cada um pode fazer.
//
// ATENÇÃO: esta tabela controla o que aparece na tela. Quem realmente protege os
// dados é o arquivo firestore.rules. Se mudar uma permissão aqui, mude também lá.
export const ROLES = {
  admin: {label: 'Administrativo'},
  vendedor: {label: 'Vendedor'},
  operacional: {label: 'Operacional'},
}

export const ROLE_IDS = Object.keys(ROLES)

const PERMISSIONS = {
  // Acesso a tudo + administra os logins da própria unidade.
  admin: {
    create: true,
    edit: true, // cliente, carro, serviço, observações, data e horário
    editPrice: true,
    complete: true, // marcar/reabrir "serviço realizado"
    star: true,
    delete: true,
    manageUsers: true,
  },
  // Lança e edita informações básicas. Não altera valor, não exclui,
  // não marca como realizado e não favorita.
  vendedor: {
    create: true,
    edit: true,
    editPrice: false,
    complete: false,
    star: false,
    delete: false,
    manageUsers: false,
  },
  // Somente visualização.
  operacional: {
    create: false,
    edit: false,
    editPrice: false,
    complete: false,
    star: false,
    delete: false,
    manageUsers: false,
  },
}

export const can = (role, action) => PERMISSIONS[role]?.[action] === true

export const ROLE_HINTS = {
  admin: null,
  vendedor:
    'Você pode lançar e editar as informações básicas. Valor, exclusão e conclusão de serviço ficam com o Administrativo.',
  operacional: 'Acesso somente para visualização.',
}