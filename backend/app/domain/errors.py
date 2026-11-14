class DomainError(Exception):
    """Erreur métier : la couche présentation la traduit en code HTTP."""


class UnsupportedFormat(DomainError):
    pass


class EmptyDocument(DomainError):
    pass


class DuplicateDocument(DomainError):
    def __init__(self, existing_id: int, title: str):
        super().__init__(f"Ce fichier est déjà importé (document #{existing_id} « {title} »).")
        self.existing_id = existing_id


class NotFound(DomainError):
    pass


class InvalidCredentials(DomainError):
    pass


class TooManyAttempts(DomainError):
    pass


class ValidationFailed(DomainError):
    pass


class LLMError(DomainError):
    pass


class NoPendingApproval(DomainError):
    pass
