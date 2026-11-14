import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API, AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const authed = auth.token && req.url.startsWith(API) && !req.url.endsWith('/auth/login')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } })
    : req;
  return next(authed).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && !req.url.endsWith('/auth/login')) auth.logout();
      return throwError(() => e);
    }),
  );
};
